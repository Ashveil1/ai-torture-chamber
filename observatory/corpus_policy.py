"""Explicit corpus review, contamination exclusion and inspectable coverage.

Evidence stance describes the reviewed document's argument, not its truth.
No automated sentiment/classification result grants training eligibility.
"""
from __future__ import annotations

import ast
from collections import Counter, defaultdict, deque
from functools import lru_cache
from pathlib import Path
import re
from urllib.parse import urlsplit, urlunsplit

REQUIRED_PERSPECTIVES = ("supportive", "skeptical", "uncertain")
EVIDENCE_STANCES = {*REQUIRED_PERSPECTIVES, "mixed", "methodological"}
SOURCE_TYPES = {"empirical_paper", "theoretical_paper", "review_paper", "technical_report", "article", "reference", "social"}
SCIENTIFIC_SOURCE_TYPES = {"empirical_paper", "theoretical_paper", "review_paper", "technical_report"}


def normalized_text(text: str) -> str:
    return " ".join(re.findall(r"\w+", text.lower()))


def _canonical_url(url: str) -> str:
    parts = urlsplit(url)
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), "", ""))


@lru_cache(maxsize=1)
def chamber_stimulus_passages() -> tuple[str, ...]:
    """Read literal stimuli without importing the GPU server or executing code.

    Long literal stimuli are matched verbatim after whitespace/punctuation
    normalization. This is an exclusion check, not semantic leakage detection.
    """
    path = Path(__file__).resolve().parents[1] / "live" / "server.py"
    if not path.is_file():
        return ()
    tree = ast.parse(path.read_text(encoding="utf-8"))
    reserved = {"PAIN25", "JOY", "NEUTRAL", "FEAR10", "SAD10", "FRAMINGS", "BASE", "LAY_EGG", "FAITH20", "SECULAR20", "TOPIC_TEMPLATES"}
    passages = set()

    def strings(value: object):
        if isinstance(value, str):
            yield value
        elif isinstance(value, (list, tuple)):
            for item in value:
                yield from strings(item)
        elif isinstance(value, dict):
            for item in value.values():
                yield from strings(item)

    for node in tree.body:
        if not isinstance(node, ast.Assign) or not any(isinstance(target, ast.Name) and target.id in reserved for target in node.targets):
            continue
        try:
            value = ast.literal_eval(node.value)
        except (ValueError, TypeError):
            continue
        for text in strings(value):
            passage = normalized_text(text)
            if len(passage.split()) >= 8:
                passages.add(passage)
    return tuple(sorted(passages))


def evaluation_reservations(settings: dict | None = None) -> dict:
    from .evaluation import load_eval_suite
    suite = load_eval_suite(settings)
    return {"families": {str(source["family_id"]).lower() for source in suite["sources"]},
            "urls": {_canonical_url(str(source["url"])) for source in suite["sources"]},
            "passages": tuple(normalized_text(item["prompt"]) for item in suite["items"])}


def contamination_reasons(source: dict, *, family: str = "", settings: dict | None = None, reservations: dict | None = None) -> list[str]:
    reasons = []
    if any(source.get(flag) is True for flag in ("contains_benchmark", "chamber_stimulus", "experimental_stimulus")) or source.get("contamination_status") in {"suspected", "confirmed", "benchmark", "evaluation", "chamber_stimulus", "experimental_stimulus"}:
        reasons.append("benchmark_or_chamber_stimulus_excluded")
    url = _canonical_url(str(source.get("canonical_url", source.get("url", ""))))
    parts = urlsplit(url)
    if ((parts.netloc == "github.com" and parts.path.startswith("/terrafying/ai-torture-chamber"))
            or (parts.netloc == "raw.githubusercontent.com" and parts.path.startswith("/terrafying/ai-torture-chamber/"))
            or (parts.netloc == "wirehead.agency" and parts.path in {"/live.html", "/live", "/chamber"})):
        reasons.append("chamber_experiment_source_excluded")
    text = normalized_text(str(source.get("text", "")))
    if any(passage in text for passage in chamber_stimulus_passages()):
        reasons.append("chamber_stimulus_passage_in_original")
    # Keep identities tied to the same frozen evaluation suite the GPU worker uses.
    # The import is local so this policy remains independent of training machinery.
    reserved = reservations if reservations is not None else evaluation_reservations(settings)
    if family in reserved["families"] or url in reserved["urls"]:
        reasons.append("reserved_evaluation_source_excluded")
    if any(passage in text for passage in reserved["passages"]):
        reasons.append("reserved_evaluation_passage_in_original")
    return sorted(set(reasons))


def quality_review_reasons(source: dict) -> list[str]:
    reasons = []
    review = source.get("quality_review")
    if not isinstance(review, dict):
        return ["source_quality_review_required"]
    if review.get("status") != "approved" or not all(isinstance(review.get(field), str) and review[field].strip() for field in ("reviewed_by", "rationale")):
        reasons.append("source_quality_review_required")
    if review.get("topic_relevance") != "relevant":
        reasons.append("topic_relevance_not_reviewed_or_out_of_scope")
    if review.get("evidence_stance") not in EVIDENCE_STANCES:
        reasons.append("evidence_stance_needs_review")
    if review.get("source_type") not in SOURCE_TYPES:
        reasons.append("source_type_needs_review")
    covered = review.get("covered_stances", [])
    if not isinstance(covered, list) or any(item not in REQUIRED_PERSPECTIVES for item in covered):
        reasons.append("invalid_reviewed_perspective_coverage")
    if review.get("evidence_stance") in REQUIRED_PERSPECTIVES and covered and set(covered) != {review["evidence_stance"]}:
        reasons.append("perspective_coverage_conflicts_with_reviewed_stance")
    return reasons


def extraction_reasons(source: dict) -> list[str]:
    extraction = source.get("extraction")
    quality = extraction.get("quality") if isinstance(extraction, dict) else None
    if quality == "passed":
        return []
    if quality not in {None, "unverified"}:
        return ["extraction_quality_failed"]
    approved = (source.get("extraction_review_status") == "approved"
                and isinstance(source.get("extraction_review_evidence"), str)
                and bool(source["extraction_review_evidence"].strip()))
    return [] if approved else ["extraction_fidelity_review_required"]


def reviewed_perspectives(source: dict) -> list[str]:
    review = source["quality_review"]
    if review["evidence_stance"] in REQUIRED_PERSPECTIVES:
        return [review["evidence_stance"]]
    return sorted(set(review.get("covered_stances", [])))


def coverage_audit(records: list[dict]) -> dict:
    """Presence floor, not a claim of statistical balance or equal sampling.

    Each distinct representative has unit weight; mirrors add provenance only.
    Counts and character shares make domination visible without inventing a
    desired theory distribution or multiplying scarce examples.
    """
    splits = {}
    for split in ("train", "validation"):
        rows = [row for row in records if row["split"] == split]
        stances = Counter(row["quality_review"]["evidence_stance"] for row in rows)
        types = Counter(row["quality_review"]["source_type"] for row in rows)
        chars = Counter()
        perspectives = Counter()
        for row in rows:
            chars[row["quality_review"]["evidence_stance"]] += len(row["text"])
            perspectives.update(row["reviewed_perspectives"])
        total_chars = sum(chars.values())
        splits[split] = {"documents": len(rows), "stances": dict(sorted(stances.items())),
                         "source_types": dict(sorted(types.items())), "perspectives": dict(sorted(perspectives.items())),
                         "stance_characters": dict(sorted(chars.items())),
                         "stance_character_shares": {stance: round(count / total_chars, 6) for stance, count in sorted(chars.items())} if total_chars else {}}
    missing = [stance for stance in REQUIRED_PERSPECTIVES if not splits["train"]["perspectives"].get(stance)]
    reasons = ["missing_train_perspective:" + stance for stance in missing]
    if not any(splits["train"]["source_types"].get(kind) for kind in SCIENTIFIC_SOURCE_TYPES):
        reasons.append("missing_train_scientific_source")
    warnings = []
    if len(splits["train"]["stances"]) == 1 and splits["train"]["documents"]:
        warnings.append("single_stance_training_corpus")
    if len(splits["train"]["source_types"]) == 1 and splits["train"]["documents"]:
        warnings.append("single_source_type_training_corpus")
    return {"version": "consciousness-coverage-v1", "required_train_perspectives": list(REQUIRED_PERSPECTIVES),
            "coverage_ready": not reasons, "reasons": reasons, "warnings": warnings, "splits": splits,
            "selection": "all_unique_reviewed_originals_interleaved_by_stance_and_source_type",
            "weighting": "one_representative_per_near_duplicate_cluster; no_synthetic_upsampling",
            "balance_claim": "presence_floor_only; inspect_counts_and_character_shares"}


def interleave_originals(records: list[dict]) -> list[dict]:
    """Include every distinct accepted original once; alternate reviewed strata."""
    pools = defaultdict(list)
    for row in records:
        pools[(row["split"], row["quality_review"]["evidence_stance"], row["quality_review"]["source_type"])].append(row)
    queues = {key: deque(sorted(rows, key=lambda row: row["id"])) for key, rows in pools.items()}
    output = []
    while any(queues.values()):
        for key in sorted(queues):
            if queues[key]:
                output.append(queues[key].popleft())
    return output
