"""Pure automatic-original approval receipts, shared by sidecar and GPU worker.

Only the Python standard library is required. Hashes protect sealed identity;
quotes establish source provenance and do not establish scientific truth.
"""
from __future__ import annotations

import hashlib
import json

POLICY_VERSION = "automatic-originals-v1"
OWNER_ACK = "originals-v1"
RECEIPT_SCHEMA = "automatic-original-review-v1"
MAX_DOCUMENT_CHARACTERS = 60_000
REQUIRED_PERSPECTIVES = ("supportive", "skeptical", "uncertain")
EVIDENCE_STANCES = {*REQUIRED_PERSPECTIVES, "mixed", "methodological"}
SOURCE_TYPES = {"empirical_paper", "theoretical_paper", "review_paper", "technical_report", "article", "reference", "social"}
VERDICT_FIELDS = {"decision", "topic_relevance", "evidence_stance", "source_type", "covered_stances", "quotes", "rationale"}


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def text_hash(source: dict) -> str:
    return hashlib.sha256(str(source.get("text", "")).encode()).hexdigest()


def policy_for(settings: dict) -> dict:
    provider = settings.get("research_provider", settings.get("agent_provider", "x402"))
    model = settings.get("research_model", settings.get("agent_model", ""))
    if provider not in {"x402", "openai", "anthropic"} or not isinstance(model, str) or not model.strip() or len(model) > 256 or any(char.isspace() for char in model):
        raise ValueError("automatic_curation_requires_explicit_supported_model")
    if settings.get("research_protocol", "responses") not in {"responses", "messages"} or settings.get("reasoning_effort", "high") not in {"low", "medium", "high", "xhigh"}:
        raise ValueError("automatic_curation_requires_supported_model_settings")
    limit = settings.get("research_max_output_tokens", 12000)
    if type(limit) is not int or not 128 <= limit <= 32768:
        raise ValueError("automatic_curation_requires_supported_output_token_limit")
    return {"version": POLICY_VERSION, "owner_ack": OWNER_ACK, "document_limit": MAX_DOCUMENT_CHARACTERS,
            "reviews": "two_blind_structured_passes", "criteria": "consciousness-originals-quality-v1",
            "provider": provider, "model": model, "protocol": settings.get("research_protocol", "responses"),
            "reasoning_effort": settings.get("reasoning_effort", "high"), "max_output_tokens": limit}


class ReviewEvidenceError(ValueError):
    def __init__(self, reason: str, verdict: dict):
        super().__init__(reason)
        self.reason, self.verdict = reason, verdict


def validate_verdict(value: object, source: dict) -> dict:
    if not isinstance(value, (dict, str)) and callable(getattr(value, "model_dump", None)):
        value = value.model_dump()
    elif isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, dict) or set(value) != VERDICT_FIELDS:
        raise ValueError("automatic_review_requires_exact_verdict_fields")
    enums = {"decision": {"accept", "reject", "uncertain"}, "topic_relevance": {"relevant", "unrelated", "uncertain"},
             "evidence_stance": EVIDENCE_STANCES | {"unclassified"}, "source_type": SOURCE_TYPES | {"unclassified"}}
    for key, choices in enums.items():
        if not isinstance(value[key], str) or value[key] not in choices:
            raise ValueError("automatic_review_classification_invalid")
    covered, quotes, rationale = value["covered_stances"], value["quotes"], value["rationale"]
    if not isinstance(covered, list) or any(not isinstance(item, str) or item not in REQUIRED_PERSPECTIVES for item in covered):
        raise ValueError("automatic_review_perspective_schema_invalid")
    if not isinstance(quotes, list) or len(quotes) > 3 or any(not isinstance(item, str) for item in quotes):
        raise ValueError("automatic_review_quote_schema_invalid")
    if not isinstance(rationale, str) or not rationale.strip() or len(rationale) > 2000:
        raise ValueError("automatic_review_requires_bounded_rationale")
    verdict = {**value, "covered_stances": sorted(set(covered)), "quotes": list(quotes)}
    if verdict["evidence_stance"] in REQUIRED_PERSPECTIVES and verdict["covered_stances"] and verdict["covered_stances"] != [verdict["evidence_stance"]]:
        raise ReviewEvidenceError("automatic_review_perspective_conflict", verdict)
    if verdict["decision"] == "accept":
        if verdict["topic_relevance"] != "relevant" or verdict["evidence_stance"] not in EVIDENCE_STANCES or verdict["source_type"] not in SOURCE_TYPES:
            raise ReviewEvidenceError("automatic_acceptance_requires_complete_classification", verdict)
        if not quotes:
            raise ReviewEvidenceError("automatic_acceptance_requires_source_quotes", verdict)
    text = source.get("text", "")
    if not isinstance(text, str):
        raise ValueError("automatic_review_requires_original_text")
    for quote in quotes:
        if not 40 <= len(quote.strip()) <= 2000 or quote not in text:
            raise ReviewEvidenceError("automatic_review_quote_not_exactly_in_original", verdict)
    return verdict


def agreement(reviews: list[dict]) -> bool:
    keys = ("decision", "topic_relevance", "evidence_stance", "source_type", "covered_stances")
    return (len(reviews) == 2 and reviews[0]["stage"] == "primary" and reviews[1]["stage"] == "critic"
            and reviews[0]["verdict"]["decision"] == "accept"
            and all(reviews[0]["verdict"][key] == reviews[1]["verdict"][key] for key in keys))


def receipt_identity(source: dict, policy: dict) -> str:
    return "curation-" + digest({"source_id": source["id"], "source_content_hash": text_hash(source), "policy_hash": digest(policy)})[:32]


def receipt_payload(receipt: dict) -> dict:
    keys = ("schema_version", "policy", "policy_hash", "source_id", "source_content_hash", "model", "provider", "mission_id", "decision", "reasons", "rationale", "reviews")
    return {key: receipt.get(key) for key in keys}


def automated_review_reasons(source: dict, review: dict) -> list[str]:
    """Return [] only for a supported, approved and source-bound auto receipt.

    Intended for both the sidecar eligibility gate and an isolated GPU image.
    The caller remains responsible for corpus rights, extraction and split gates.
    """
    try:
        if not isinstance(review, dict) or review.get("status") != "approved" or review.get("reviewer_kind") != "automated":
            raise ValueError("automatic_approval_required")
        if not all(isinstance(review.get(key), str) and review[key].strip() for key in ("reviewed_by", "rationale")):
            raise ValueError("reviewer_and_rationale_required")
        if not isinstance(source.get("id"), str) or not source["id"] or not isinstance(source.get("text"), str) or not 200 <= len(source["text"]) <= MAX_DOCUMENT_CHARACTERS:
            raise ValueError("original_source_identity_and_full_text_required")
        receipt = review.get("receipt")
        if not isinstance(receipt, dict) or receipt.get("immutable") is not True or receipt.get("schema_version") != RECEIPT_SCHEMA:
            raise ValueError("receipt_missing_or_unsupported")
        if set(receipt) - {*receipt_payload(receipt), "id", "immutable", "created_at", "updated_at", "receipt_hash"}:
            raise ValueError("receipt_contains_unrecognized_fields")
        policy = receipt.get("policy")
        if not isinstance(policy, dict) or policy.get("version") != POLICY_VERSION or policy.get("owner_ack") != OWNER_ACK:
            raise ValueError("policy_missing_or_unsupported")
        expected = policy_for({"research_provider": policy.get("provider"), "research_model": policy.get("model"),
                               "research_protocol": policy.get("protocol"), "reasoning_effort": policy.get("reasoning_effort"),
                               "research_max_output_tokens": policy.get("max_output_tokens")})
        if policy != expected or receipt.get("policy_hash") != digest(policy) or review.get("policy_hash") != digest(policy):
            raise ValueError("policy_hash_mismatch")
        if receipt.get("receipt_hash") != digest(receipt_payload(receipt)):
            raise ValueError("receipt_hash_mismatch")
        if receipt.get("source_id") != source["id"] or receipt.get("source_content_hash") != text_hash(source) or review.get("source_content_hash") != text_hash(source):
            raise ValueError("source_content_changed")
        if review.get("review_id") != receipt.get("id") or receipt.get("id") != receipt_identity(source, policy):
            raise ValueError("review_identity_mismatch")
        if review.get("approval_basis") != "owner_policy" or review.get("policy_version") != POLICY_VERSION:
            raise ValueError("approval_authority_missing")
        if not receipt.get("mission_id") or receipt.get("decision") != "accepted" or receipt.get("reasons") != []:
            raise ValueError("receipt_does_not_accept_original")
        if review.get("model") != policy["model"] or receipt.get("model") != policy["model"] or receipt.get("provider") != policy["provider"]:
            raise ValueError("review_model_mismatch")
        reviews = receipt.get("reviews")
        if not isinstance(reviews, list) or len(reviews) != 2 or any(not isinstance(item, dict) or set(item) != {"stage", "verdict"} for item in reviews):
            raise ValueError("two_blind_verdicts_required")
        checked = [{"stage": item["stage"], "verdict": validate_verdict(item["verdict"], source)} for item in reviews]
        if checked != reviews or not agreement(checked):
            raise ValueError("independent_verdicts_do_not_agree")
        verdict = checked[0]["verdict"]
        for key in ("topic_relevance", "evidence_stance", "source_type", "covered_stances"):
            if review.get(key, []) != verdict[key]:
                raise ValueError("review_classification_differs_from_receipt")
    except (ValueError, TypeError, KeyError, AttributeError):
        return ["automated_quality_review_receipt_invalid"]
    return []
