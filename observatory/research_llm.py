"""Responses-native Browser Use adapter; imports paid SDKs only when configured."""
from __future__ import annotations

from typing import Any


class ResponsesResearchModel:
    _verified_api_keys = False
    provider = "openai"

    def __init__(self, model: str, api_key: str, *, client: Any = None, effort: str = "high"):
        self.model = model
        self.effort = effort
        if client is None:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=api_key, timeout=120, max_retries=2)
        self.client = client

    @property
    def name(self):
        return self.model

    @property
    def model_name(self):
        return self.model

    @staticmethod
    def inputs(messages):
        values = []
        for message in messages:
            role = getattr(message, "role", "user")
            content = getattr(message, "content", "")
            if isinstance(content, str):
                values.append({"role": role, "content": content})
                continue
            parts = []
            for part in content:
                if getattr(part, "type", None) == "text":
                    parts.append({"type": "output_text" if role == "assistant" else "input_text", "text": part.text})
                elif getattr(part, "type", None) == "image_url":
                    parts.append({"type": "input_image", "image_url": part.image_url.url, "detail": part.image_url.detail})
            values.append({"role": role, "content": parts})
        return values

    async def ainvoke(self, messages, output_format=None, **kwargs):
        from browser_use.llm.views import ChatInvokeCompletion, ChatInvokeUsage
        arguments = {"model": self.model, "input": self.inputs(messages), "store": False,
                     "max_output_tokens": 12000, "reasoning": {"effort": self.effort}}
        if output_format:
            from browser_use.llm.schema import SchemaOptimizer
            schema = SchemaOptimizer.create_optimized_json_schema(output_format, remove_defaults=True)
            arguments["text"] = {"format": {"type": "json_schema", "name": output_format.__name__, "strict": True, "schema": schema}}
        response = await self.client.responses.create(**arguments)
        if response.status != "completed":
            raise RuntimeError("Research model response incomplete; retry this research pass")
        if any(getattr(item, "type", None) == "refusal" for output in response.output for item in getattr(output, "content", [])):
            raise RuntimeError("Research model declined this action")
        text = response.output_text
        if not text:
            raise RuntimeError("Research model returned no actionable output")
        completion = output_format.model_validate_json(text) if output_format else text
        usage = response.usage
        receipt = ChatInvokeUsage(prompt_tokens=usage.input_tokens, completion_tokens=usage.output_tokens,
                                  total_tokens=usage.total_tokens,
                                  prompt_cached_tokens=getattr(usage.input_tokens_details, "cached_tokens", 0),
                                  prompt_cache_creation_tokens=None, prompt_image_tokens=None) if usage else None
        return ChatInvokeCompletion(completion=completion, usage=receipt, stop_reason="end_turn")


def researcher_model(settings):
    import os
    provider = settings.get("research_provider", settings.get("agent_provider", "openai"))
    model = settings.get("research_model", settings.get("agent_model"))
    if provider == "openai":
        key = settings.get("openai_api_key") or os.environ.get("OPENAI_API_KEY")
        if not key:
            raise ValueError("Connect an OpenAI API key in operator setup")
        return ResponsesResearchModel(model or "gpt-6-astra", key, effort=settings.get("reasoning_effort", "high"))
    if provider == "anthropic":
        from browser_use import ChatAnthropic
        key = settings.get("anthropic_api_key") or os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise ValueError("Connect a Claude API key in operator setup")
        import httpx
        return ChatAnthropic(model=model or "claude-fable-5-1", api_key=key, thinking={"type": "adaptive"},
                             http_client=httpx.AsyncClient(timeout=120))
    raise ValueError("Select OpenAI or Claude as the researcher model provider")
