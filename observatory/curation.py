"""Deterministic source eligibility and immutable, leakage-resistant snapshots."""
from __future__ import annotations

import hashlib
import heapq
import json
import re
from urllib.parse import urlsplit, urlunsplit

from .store import Store, utc_now

POLICY_VERSION = "consciousness-corpus-v1"
ALLOWED_LICENSES = {"cc0", "cc0-1.0", "public-domain", "cc-by", "cc-by-4.0", "cc-by-3.0"}


def canonical_hash(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def family_id(source: dict) -> str:
    if source.get("family_id"):
        return str(source["family_id"]).lower()
    if source.get("doi"):
        return "doi:" + str(source["doi"]).lower().removeprefix("https://doi.org/")
    url = source.get("canonical_url", source.get("url", ""))
    arxiv = re.search(r"(?:arxiv\.org/(?:abs|html|pdf)/|arxiv:)(\d{4}\.\d{4,5})(?:v\d+)?", url, re.I)
    if arxiv:
        return "arxiv:" + arxiv.group(1)
    parts = urlsplit(url)
    return "url:" + urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), "", ""))


def eligibility(source: dict) -> dict:
    reasons: list[str] = []
    license_name = str(source.get("license", "unknown")).lower().replace("_", "-").replace(" ", "-")
    has_permission = source.get("rights_status") == "permission_granted" and bool(source.get("permission_evidence"))
    if not source.get("license_verified") and not has_permission:
        reasons.append("rights_not_verified")
    if license_name not in ALLOWED_LICENSES and not has_permission:
        reasons.append("license_not_in_public_corpus_policy")
    if not source.get("rights_evidence") and not source.get("permission_evidence"):
        reasons.append("missing_rights_evidence")
    if not source.get("provenance"):
        reasons.append("missing_source_provenance")
    if not str(source.get("canonical_url", "")).startswith(("https://", "http://")):
        reasons.append("missing_canonical_url")
    if len(str(source.get("text", "")).strip()) < 200:
        reasons.append("insufficient_original_text")
    if source.get("source_type") in {"social", "social_post", "reddit", "x", "twitter"} and not has_permission:
        reasons.append("social_content_requires_separate_permission")
    if source.get("review_status") in {"rejected", "quarantined"}:
        reasons.append("owner_review_excludes_source")
    return {"status": "eligible" if not reasons else "quarantined", "eligible": not reasons, "reasons": reasons}


def _normalize(text: str) -> str:
    return " ".join(re.findall(r"\w+", text.lower()))


def _shingles(text: str) -> set[str]:
    words = _normalize(text).split()
    return {" ".join(words[i:i + 5]) for i in range(max(0, len(words) - 4))}


def build_snapshot(store: Store) -> dict:
    """Never includes raw research notes; only evidence-checked Q&A can enter SFT."""
    sources = store.list_records("sources")
    allowed = sorted((source for source in sources if eligibility(source)["eligible"]), key=lambda source: source["id"])
    rejected = [{"source_id": source["id"], **eligibility(source)} for source in sources if not eligibility(source)["eligible"]]
    parents = {source["id"]: source["id"] for source in allowed}

    def find(item: str) -> str:
        while parents[item] != item:
            parents[item] = parents[parents[item]]
            item = parents[item]
        return item

    def union(left: str, right: str) -> None:
        first, second = sorted((find(left), find(right)))
        parents[second] = first

    shingles: dict[str, set[str]] = {}
    family_index: dict[str, set[str]] = {}
    fingerprint_index: dict[bytes, set[str]] = {}
    # Bottom-k fingerprints select candidate near duplicates, avoiding a full
    # pairwise scan. Exact version-family grouping is unconditional; approximate
    # content candidates receive a full shingle Jaccard check before grouping.
    for source in allowed:
        identifier = source["id"]
        family = family_id(source)
        grams = _shingles(source["text"])
        fingerprints = heapq.nsmallest(24, (hashlib.blake2b(gram.encode(), digest_size=8).digest() for gram in grams))
        candidates = set(family_index.get(family, set()))
        for fingerprint in fingerprints:
            candidates.update(fingerprint_index.get(fingerprint, set()))
        for candidate in candidates:
            previous = shingles[candidate]
            overlap = len(grams & previous) / max(1, len(grams | previous))
            if candidate in family_index.get(family, set()) or overlap >= 0.85:
                union(identifier, candidate)
        shingles[identifier] = grams
        family_index.setdefault(family, set()).add(identifier)
        for fingerprint in fingerprints:
            fingerprint_index.setdefault(fingerprint, set()).add(identifier)

    groups: dict[str, list[dict]] = {}
    for source in allowed:
        groups.setdefault(find(source["id"]), []).append(source)
    original: list[dict] = []
    assignment: dict[str, str] = {}
    group_ids: dict[str, str] = {}
    # Explicit holdout propagates across duplicate groups and document versions.
    heldout_source_families = {family_id(source) for source in sources if source.get("split") in {"validation", "test", "heldout"} or source.get("held_out")}
    source_map = {source["id"]: source for source in allowed}
    for group in groups.values():
        group_family = sorted(family_id(source) for source in group)[0]
        heldout = any(family_id(source) in heldout_source_families for source in group)
        previous_assignments = [store.get("family_splits", canonical_hash(family_id(source))) for source in group]
        previous_splits = {item["split"] for item in previous_assignments if item}
        if "train" in previous_splits and (heldout or "validation" in previous_splits):
            # Already trained material must never be presented as a fresh held-out family.
            rejected.extend({"source_id": source["id"], "eligible": False, "status": "quarantined",
                             "reasons": ["persistent_train_holdout_family_conflict"]} for source in group)
            continue
        bucket = int(hashlib.sha256(group_family.encode()).hexdigest()[:8], 16) % 10
        split = (next(iter(previous_splits)) if previous_splits else
                 "validation" if heldout or bucket == 0 else "train")
        for source in group:
            assignment[source["id"]] = split
            group_ids[source["id"]] = group_family
            if not store.get("family_splits", canonical_hash(family_id(source))):
                store.put("family_splits", {"id": canonical_hash(family_id(source)), "family_id": family_id(source),
                                            "split": split, "policy_version": POLICY_VERSION})
        seen_text: set[str] = set()
        for source in group:
            text_hash = hashlib.sha256(_normalize(source["text"]).encode()).hexdigest()
            if text_hash in seen_text:
                continue
            seen_text.add(text_hash)
            original.append({
                "id": "doc-" + text_hash[:24], "text": source["text"],
                "source_ids": [source["id"]], "family_id": group_family, "split": split,
                "license": source["license"], "rights_evidence": source.get("rights_evidence", source.get("permission_evidence")),
                "provenance": source["provenance"], "canonical_url": source["canonical_url"],
                "source_version": source.get("version"), "content_hash": text_hash,
                "synthetic": False,
            })
    synthetic: list[dict] = []
    seen_instructions: set[str] = set()
    excluded_notes: list[dict] = []
    settings = store.get_settings(private=True)
    provider_policy_reference = settings.get("provider_policy_reference", "")
    synthetic_policy_approved = settings.get("synthetic_training_approved") is True and isinstance(provider_policy_reference, str) and bool(provider_policy_reference.strip())
    for note in sorted(store.list_records("notes"), key=lambda item: item["id"]):
        source_ids = note.get("source_ids") or ([note["source_id"]] if note.get("source_id") else [])
        messages = note.get("messages")
        if not messages and note.get("question") and note.get("answer"):
            messages = [{"role": "user", "content": note["question"]}, {"role": "assistant", "content": note["answer"]}]
        reasons: list[str] = []
        if not synthetic_policy_approved:
            reasons.append("synthetic_output_training_policy_not_approved")
        if note.get("review_status") != "approved":
            reasons.append("synthetic_example_needs_explicit_owner_review")
        if not note.get("support_verified") or not note.get("evidence_ids"):
            reasons.append("missing_verified_passage_support")
        if not source_ids or any(source_id not in assignment for source_id in source_ids):
            reasons.append("unapproved_or_missing_sources")
        if not messages or not isinstance(messages, list) or not all(
            isinstance(message, dict) and message.get("role") in {"system", "user", "assistant"}
            and isinstance(message.get("content"), str) and message["content"].strip() for message in messages
        ) or not any(message.get("role") == "assistant" for message in (messages or []) if isinstance(message, dict)):
            reasons.append("not_a_supported_instruction_example")
        if note.get("contains_benchmark") or note.get("review_status") in {"rejected", "quarantined"}:
            reasons.append("excluded_by_review_or_benchmark_policy")
        evidence = [store.get("evidence", evidence_id) for evidence_id in note.get("evidence_ids", [])]
        if not evidence or any(not item or not item.get("support_verified") or not item.get("source_id") in source_ids
                               or not item.get("passage") for item in evidence):
            reasons.append("evidence_records_missing_or_unverified")
        elif any(len(_normalize(item["passage"])) < 20 or
                 _normalize(item["passage"]) not in _normalize(source_map.get(item["source_id"], {}).get("text", "")) for item in evidence):
            reasons.append("evidence_passage_not_in_source")
        if len({assignment[source_id] for source_id in source_ids if source_id in assignment}) > 1:
            reasons.append("instruction_spans_train_and_holdout_families")
        if reasons:
            excluded_notes.append({"note_id": note["id"], "reasons": sorted(set(reasons))})
            continue
        # Cross-split syntheses are excluded; a held-out family's examples stay held out.
        split = "validation" if any(assignment[source_id] == "validation" for source_id in source_ids) else "train"
        instruction_hash = canonical_hash(messages)
        if instruction_hash in seen_instructions:
            excluded_notes.append({"note_id": note["id"], "reasons": ["duplicate_instruction_example"]})
            continue
        seen_instructions.add(instruction_hash)
        synthetic.append({
            "id": "sft-" + canonical_hash({"messages": messages, "sources": sorted(source_ids)})[:24],
            "messages": messages, "source_ids": sorted(source_ids), "evidence_ids": sorted(note["evidence_ids"]),
            "family_ids": sorted({group_ids[source_id] for source_id in source_ids}), "split": split,
            "synthetic": True, "generated_by": note.get("generated_by", "unspecified"),
            "prompt_version": note.get("prompt_version", "unspecified"),
        })
    manifest = {
        "policy_version": POLICY_VERSION,
        "synthetic_policy": {"owner_approved": synthetic_policy_approved,
                             "provider_policy_reference": provider_policy_reference if synthetic_policy_approved else None},
        "source_ids": sorted(assignment),
        "source_records": [{"id": source["id"], "version": source.get("version"),
                            "text_hash": hashlib.sha256(source["text"].encode()).hexdigest(),
                            "license": source.get("license"), "rights_evidence": source.get("rights_evidence"),
                            "provenance": source.get("provenance")} for source in allowed],
        "original_text": original, "synthetic_sft": synthetic,
        "excluded_sources": rejected, "excluded_notes": excluded_notes,
    }
    manifest_hash = canonical_hash(manifest)
    corpus_hash = canonical_hash({
        "original": sorted((item["content_hash"], item["family_id"], item["split"]) for item in original),
        "synthetic": sorted((item["id"], item["split"]) for item in synthetic),
    })
    snapshot_id = "snapshot-" + manifest_hash[:24]
    existing = store.get("datasets", snapshot_id)
    if existing:
        return existing
    train_families = sorted({record["family_id"] for record in original if record["split"] == "train"})
    heldout_families = sorted({record["family_id"] for record in original if record["split"] == "validation"})
    record = store.put("datasets", {
        "id": snapshot_id, "manifest_hash": manifest_hash, "corpus_hash": corpus_hash, "policy_version": POLICY_VERSION,
        "immutable": True, "status": "candidate", "created_at": utc_now(),
        "source_ids": sorted(assignment), "train_family_ids": train_families,
        "heldout_family_ids": heldout_families, "original_text": original, "synthetic_sft": synthetic,
        "manifest": manifest,
        "counts": {"original_documents": len(original), "original_characters": sum(len(item["text"]) for item in original),
                   "train_documents": sum(item["split"] == "train" for item in original),
                   "validation_documents": sum(item["split"] == "validation" for item in original),
                   "synthetic_examples": len(synthetic), "excluded_sources": len(rejected), "excluded_notes": len(excluded_notes)},
    })
    store.event("dataset.snapshot", "Created immutable corpus candidate", data={"snapshot_id": snapshot_id, "counts": record["counts"]})
    return record
