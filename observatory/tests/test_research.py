import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest

from observatory import network
from observatory.research import ResearchSupervisor, browser_endpoint, document_metadata, save_document, save_note
from observatory.research_llm import ResponsesResearchModel
from observatory.store import Store


@pytest.fixture
def store(tmp_path):
    value = Store(tmp_path / "state.db")
    yield value
    value.close()


@pytest.mark.asyncio
async def test_private_destinations_rejected(monkeypatch):
    for url in ("http://localhost/", "http://metadata.google.internal/", "http://user:password@example.org/"):
        with pytest.raises(ValueError):
            await network.public_url(url)
    monkeypatch.setattr(network.socket, "getaddrinfo", lambda *args: [(2, 1, 6, "", ("127.0.0.1", 80))])
    with pytest.raises(ValueError):
        await network.public_url("https://public-looking.example/")


@pytest.mark.asyncio
async def test_robots_missing_allowed_but_errors_closed(monkeypatch):
    async def valid(url):
        return url
    monkeypatch.setattr(network, "public_url", valid)
    async def missing(url, **kwargs):
        return httpx.Response(404)
    monkeypatch.setattr(network, "public_get", missing)
    assert await network.CollectionPolicy().allowed("https://example.org/paper")
    async def broken(url, **kwargs):
        return httpx.Response(503)
    monkeypatch.setattr(network, "public_get", broken)
    assert not await network.CollectionPolicy().allowed("https://example.org/paper")
    async def excluded(url, **kwargs):
        return httpx.Response(200, text="User-agent: *\nDisallow: /private")
    monkeypatch.setattr(network, "public_get", excluded)
    policy = network.CollectionPolicy()
    assert not await policy.allowed("https://example.org/private/paper")
    assert await policy.allowed("https://example.org/open/paper")


def test_only_article_license_metadata_verifies_rights():
    assert not document_metadata('<footer><a href="https://creativecommons.org/licenses/by/4.0/">CC-BY</a></footer>')
    assert not document_metadata('<script type="application/ld+json">{"@type":"Organization","license":"https://creativecommons.org/licenses/by/4.0/"}</script>')
    result = document_metadata('<script type="application/ld+json">{"@type":"ScholarlyArticle","license":"https://creativecommons.org/licenses/by/4.0/"}</script>')
    assert result["license_verified"] and result["license"] == "cc-by-4.0"


def test_document_versions_and_literal_provenance(store):
    passage = "The existence of subjective experience cannot be established solely through linguistic self reports."
    source = save_document(store, url="https://example.org/paper#part", title="Research", text=(passage + "\n") * 4, agent_id="scholar")
    assert source["canonical_url"] == "https://example.org/paper"
    assert not source["curation"]["eligible"]
    repeated = save_document(store, url=source["canonical_url"], title="Research", text=source["text"], agent_id="skeptic")
    assert repeated["id"] == source["id"]
    note = save_note(store, source, "scholar", "Self-report needs external evidence.", passage, "Can a report establish consciousness?", "The paper argues it cannot.")
    assert note["support_verified"] and note["review_status"] == "pending"
    unsupported = save_note(store, source, "scholar", "A conjecture", "A fabricated passage that does not occur in the paper at all.", "Q?", "A.")
    assert not unsupported["support_verified"] and not unsupported["question"]
    assert "text" not in store.state()["sources"][0]
    assert "Self-report" in store.state()["notes"][0]["text"]


@pytest.mark.asyncio
async def test_owned_browser_stopped_even_when_work_raises(tmp_path, monkeypatch):
    calls = []
    def handler(request):
        calls.append((request.method, request.url.path))
        if request.method == "POST":
            return httpx.Response(200, json={"id": "session-1", "cdpUrl": "wss://trusted-provider/cdp?token=secret"})
        return httpx.Response(200, json={"status": "stopped"})
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr("observatory.research.httpx.AsyncClient", lambda **kwargs: client)
    with pytest.raises(RuntimeError, match="work failed"):
        async with browser_endpoint({"browser_use_api_key": "test-key"}, tmp_path) as endpoint:
            assert endpoint.startswith("wss:")
            raise RuntimeError("work failed")
    assert calls == [("POST", "/api/v4/browsers"), ("PATCH", "/api/v4/browsers/session-1")]


@pytest.mark.asyncio
async def test_read_only_route_rejects_posts_and_private_pages(store, monkeypatch):
    supervisor = ResearchSupervisor(store)
    calls = []
    class Route:
        request = SimpleNamespace(method="POST", url="https://example.org/comment", is_navigation_request=lambda: True)
        async def abort(self, reason):
            calls.append("abort")
        async def continue_(self):
            calls.append("continue")
    await supervisor._route(Route())
    assert calls == ["abort"]


@pytest.mark.asyncio
async def test_mission_stop_cancels_worker_and_preserves_notes(store):
    store.set_mission({"id": "mission", "status": "running", "objective": "Research"})
    supervisor = ResearchSupervisor(store)
    entered = asyncio.Event()
    async def work(agent_id, specialty):
        entered.set()
        await asyncio.Event().wait()
    supervisor._researcher = work
    await supervisor.start()
    await asyncio.wait_for(entered.wait(), 2)
    store.put("notes", {"text": "Retained notebook"})
    store.set_mission({"id": "mission", "status": "stopping"})
    for _ in range(30):
        if store.get_mission()["status"] == "stopped":
            break
        await asyncio.sleep(0.1)
    assert store.get_mission()["status"] == "stopped" and not supervisor.workers
    assert store.list_records("notes")[0]["text"] == "Retained notebook"
    await supervisor.close()


def test_responses_message_mapping_preserves_images():
    image = SimpleNamespace(type="image_url", image_url=SimpleNamespace(url="data:image/png;base64,abc", detail="auto"))
    text = SimpleNamespace(type="text", text="Read this page")
    messages = [SimpleNamespace(role="system", content="Mission"), SimpleNamespace(role="user", content=[text, image])]
    values = ResponsesResearchModel.inputs(messages)
    assert values[1]["content"][1] == {"type": "input_image", "image_url": "data:image/png;base64,abc", "detail": "auto"}


@pytest.mark.asyncio
async def test_responses_sdk_structured_action_and_usage_contract():
    from openai import AsyncOpenAI
    from pydantic import BaseModel
    from browser_use.llm.messages import UserMessage
    class Observation(BaseModel):
        observation: str
    received = []
    def handler(request):
        received.append(json.loads(request.content))
        return httpx.Response(200, json={
            "id": "resp_fixture", "object": "response", "created_at": 123, "model": "gpt-6-astra", "status": "completed",
            "output": [{"id": "message_fixture", "type": "message", "role": "assistant", "status": "completed",
                        "content": [{"type": "output_text", "text": '{"observation":"Evidence remains uncertain."}', "annotations": []}]}],
            "usage": {"input_tokens": 123, "output_tokens": 12, "total_tokens": 135, "input_tokens_details": {"cached_tokens": 6},
                      "output_tokens_details": {"reasoning_tokens": 4}}})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        async with AsyncOpenAI(api_key="fixture-key", http_client=http) as client:
            model = ResponsesResearchModel("gpt-6-astra", "fixture-key", client=client)
            result = await model.ainvoke([UserMessage(content="Inspect evidence")], Observation)
    assert result.completion.observation == "Evidence remains uncertain."
    assert result.usage.total_tokens == 135 and result.usage.prompt_cached_tokens == 6
    assert received[0]["text"]["format"]["strict"] is True
    assert received[0]["store"] is False and "temperature" not in received[0]
    assert result.thinking is None


@pytest.mark.asyncio
async def test_cancellation_during_creation_still_stops_owned_browser(tmp_path, monkeypatch):
    created = asyncio.Event()
    release = asyncio.Event()
    stopped = []
    async def handler(request):
        if request.method == "POST":
            created.set()
            await release.wait()
            return httpx.Response(200, json={"id": "cancelled-session", "cdpUrl": "wss://provider/cdp"})
        stopped.append(request.url.path)
        return httpx.Response(200)
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr("observatory.research.httpx.AsyncClient", lambda **kwargs: client)
    async def work():
        async with browser_endpoint({"browser_use_api_key": "fixture-key"}, tmp_path):
            pytest.fail("Cancelled provisioning must not enter the research body")
    task = asyncio.create_task(work())
    await created.wait()
    task.cancel()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert stopped == ["/api/v4/browsers/cancelled-session"]


def test_article_isolation_does_not_license_publisher_surroundings(store):
    from observatory.research import extract_html
    original = "Original research content with uncertainty and competing interpretations. " * 6
    html = '<script type="application/ld+json">{"@type":"ScholarlyArticle","license":"https://creativecommons.org/licenses/by/4.0/"}</script><body><nav>Publisher links</nav><article>' + original + '<aside>Ad copy</aside><div id="comments">Reader comments</div></article><footer>Publisher rights</footer></body>'
    text, scope = extract_html(html)
    assert scope == "article" and "Publisher" not in text and "Ad copy" not in text and "Reader comments" not in text
    source = save_document(store, url="https://example.org/article", title="Research", text=text, html=html, agent_id="scholar", scope=scope)
    assert source["curation"]["eligible"]
    ambiguous = save_document(store, url="https://example.org/home", title="Page", text=original, html=html, agent_id="scholar", scope="body")
    assert not ambiguous["license_verified"] and not ambiguous["curation"]["eligible"]


@pytest.mark.asyncio
async def test_provider_error_does_not_undo_operator_stop(store, monkeypatch):
    store.set_mission({"id": "mission", "status": "stopping"})
    async def handler(request):
        return httpx.Response(503)
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr("observatory.research.httpx.AsyncClient", lambda **kwargs: client)
    with pytest.raises(httpx.HTTPStatusError):
        async with browser_endpoint({"browser_use_api_key": "fixture-key"}, store.path.parent, store):
            pytest.fail("Rejected provisioning must not start a browser")
    assert store.get_mission()["status"] == "stopping"
    assert store.list_records("browser_sessions")[0]["status"] == "creation_unknown"
