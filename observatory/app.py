"""Standalone observatory API; no chamber model or live.server imports."""
from __future__ import annotations

import asyncio
import base64
from contextlib import asynccontextmanager
import hmac
import importlib
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from uuid import UUID, uuid4
import zipfile

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response, StreamingResponse

from .curation import build_snapshot, canonical_hash, eligibility
from .store import Store, utc_now

SITE = Path(__file__).resolve().parents[1] / "site"
SOLANA_NETWORKS = {"solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"}
USDC_MINTS = {"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"}


def _broker_client():
    from .x402_client import X402BrokerClient
    return X402BrokerClient()


def _public_catalog(payload: dict, db: Store) -> dict:
    models = []
    for record in payload.get("models", [])[:500]:
        if not isinstance(record, dict):
            continue
        identifier = record.get("id", "")
        capabilities = record.get("capabilities", {})
        protocols = record.get("protocols", record.get("supportedprotocols", record.get("supported_protocols", [])))
        capability_source = record.get("capability_source")
        if capability_source not in {"owner_declared", "gateway_advertised"} or record.get("eligible") is not True:
            continue
        if not isinstance(identifier, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,159}", identifier):
            continue
        if not isinstance(capabilities, dict) or capabilities.get("vision") is not True or capabilities.get("structured_actions") is not True:
            continue
        protocols = [item for item in protocols if (item == "responses" and capabilities.get("structured_outputs") is True)
                     or (item == "messages" and capabilities.get("tool_calling") is True)] if isinstance(protocols, list) else []
        if not protocols:
            continue
        name = db.sanitize(str(record.get("name", identifier)), strip_content=False)
        if re.search(r"https?://|wss?://|Bearer\s", name, re.I):
            name = identifier
        categories = [item for item in record.get("categories", []) if isinstance(item, str) and re.fullmatch(r"[A-Za-z0-9 _-]{1,40}", item)] if isinstance(record.get("categories"), list) else []
        models.append({"id": identifier, "name": name[:160], "categories": categories[:12], "protocols": sorted(set(protocols)),
                       "capabilities": {key: capabilities.get(key) is True for key in ("vision", "structured_actions", "structured_outputs", "tool_calling")},
                       "capability_source": capability_source, "eligible": True, "compatibility_tested": False,
                       "availability": "advertised"})
    return {"status": "available" if models else "unavailable", "models": models,
            "network": payload.get("network") if payload.get("network") in SOLANA_NETWORKS else None,
            "asset": payload.get("asset") if payload.get("asset") in USDC_MINTS else None}


def _public_funding(payload: dict) -> dict:
    def atomic(value):
        return value if isinstance(value, str) and re.fullmatch(r"[0-9]{1,40}", value) else None

    def address(value, minimum=32, maximum=44):
        return value if isinstance(value, str) and re.fullmatch(rf"[1-9A-HJ-NP-Za-km-z]{{{minimum},{maximum}}}", value) else None

    network = payload.get("network") if payload.get("network") in SOLANA_NETWORKS else None
    asset = payload.get("asset") if payload.get("asset") in USDC_MINTS else None
    receipts = []
    for record in payload.get("receipts", [])[:100]:
        if not isinstance(record, dict):
            continue
        identifier = record.get("request_id", "")
        status = record.get("status", "unknown")
        receipts.append({"request_id": identifier if isinstance(identifier, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,128}", identifier) else None,
                         "status": status if status in {"intent", "cancelled", "reserved", "signing", "signed", "authorized", "submitted", "settlement_pending", "settled", "confirmed", "finalized", "failed", "refunded", "unknown", "service_failed", "delivered"} else "unknown",
                         "amount_atomic": atomic(record.get("amount_atomic")),
                         "transaction": address(record.get("transaction"), 64, 90),
                         "network": record.get("network") if record.get("network") in SOLANA_NETWORKS else network,
                         "asset": record.get("asset") if record.get("asset") in USDC_MINTS else asset})
    status = payload.get("status")
    reason = payload.get("reason")
    return {"status": status if status in {"configured", "unfunded", "ready", "unknown", "disabled"} else "unknown",
            "configured": payload.get("configured") is True, "enabled": payload.get("enabled") is True,
            "wallet_address": address(payload.get("wallet_address")), "network": network, "asset": asset,
            "balance_atomic": atomic(payload.get("balance_atomic")), "reserved_atomic": atomic(payload.get("reserved_atomic")),
            "settled_atomic": atomic(payload.get("settled_atomic")), "receipts": receipts,
            "daily_spent_and_reserved_atomic": atomic(payload.get("daily_spent_and_reserved_atomic")),
            "daily_remaining_atomic": atomic(payload.get("daily_remaining_atomic")),
            "required_request_reserve_atomic": atomic(payload.get("required_request_reserve_atomic")),
            "reason": reason if reason in {"DAILY_LIMIT", "UNFUNDED", "SETTLEMENT_UNKNOWN", "FUNDING_UNKNOWN", "NOT_CONFIGURED", "SIGNER_INVALID", "SIGNER_NOT_CONFIGURED"} else None,
            "hf_jobs": {"status": "separate", "message": "Hugging Face Jobs uses its own account credits; this wallet does not fund those credits automatically."}}


def _request_id(value: str) -> str:
    try:
        if str(UUID(value)) != value:
            raise ValueError
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(422, "Select a canonical research payment request UUID") from None
    return value


def _pending_payment_metadata(record: dict, db: Store) -> dict:
    return db.sanitize({key: record.get(key) for key in
                        ("request_id", "scope", "body_hash", "protocol", "created_at")})


def _owner_payment_inspection(payload: dict, request_id: str, db: Store) -> dict:
    """Keep cached vendor output owner-only; never relay request or signing data."""
    states = {"not_found", "intent", "cancelled", "reserved", "signing", "authorized", "unknown",
              "completed", "settled_error", "reconciled"}
    state = payload.get("state")
    found = payload.get("found")
    status = "settled" if state in {"completed", "settled_error", "reconciled"} else state
    if (payload.get("request_id") != request_id or state not in states
            or type(found) is not bool or found != (state != "not_found")
            or type(payload.get("in_flight")) is not bool or payload.get("status") != status
            or (not found and (payload.get("response") is not None or payload.get("payment") is not None))
            or (payload.get("response") is not None and not isinstance(payload.get("response"), dict))):
        raise HTTPException(502, "Payment broker returned an invalid inspection result")

    excluded = {"body", "request", "request_body", "headers", "header", "signature", "signatures"}
    request_fields = {"prompt", "input", "input_items", "messages", "system", "instructions"}

    def output_only(value, *, root=False):
        if isinstance(value, dict):
            return {key: output_only(item) for key, item in value.items()
                    if key.lower() not in excluded and not (root and key.lower() in request_fields)}
        if isinstance(value, list):
            return [output_only(item) for item in value]
        return value

    payment = payload.get("payment")
    if found and not isinstance(payment, dict):
        raise HTTPException(502, "Payment broker returned an invalid receipt")
    if isinstance(payment, dict):
        if payment.get("request_id") != request_id or payment.get("status") != status:
            raise HTTPException(502, "Payment broker receipt does not match the requested intent")
        payment = _public_funding({"receipts": [payment]})["receipts"][0]
    else:
        payment = None
    return {"found": found, "request_id": request_id, "status": status, "state": state,
            "in_flight": payload["in_flight"], "response": db.sanitize(output_only(payload.get("response"), root=True), strip_content=False),
            "payment": payment}


def _dataset_archive(record: dict):
    manifest = record.get("manifest")
    if record.get("immutable") is not True or record.get("demo") or not isinstance(manifest, dict):
        raise HTTPException(409, "Only a sealed, actual dataset snapshot can be exported")
    original, synthetic = record.get("original_text", []), record.get("synthetic_sft", [])
    if (canonical_hash(manifest) != record.get("manifest_hash") or manifest.get("original_text") != original
            or manifest.get("synthetic_sft") != synthetic):
        raise HTTPException(409, "Snapshot integrity check failed; export was refused")
    if any(item.get("split") not in {"train", "validation"} for item in original + synthetic):
        raise HTTPException(409, "Snapshot contains an unsupported split")
    corpus_hash = canonical_hash({"original": sorted((item["content_hash"], item["family_id"], item["split"]) for item in original),
                                  "synthetic": sorted((item["id"], item["split"]) for item in synthetic)})
    if corpus_hash != record.get("corpus_hash"):
        raise HTTPException(409, "Snapshot corpus hash does not match its sealed records")
    metadata = {"manifest.json": manifest, "rights-provenance.json": manifest.get("source_records", []),
                "exclusions.json": {"sources": manifest.get("excluded_sources", []), "notes": manifest.get("excluded_notes", [])},
                "snapshot.json": {key: record.get(key) for key in ("id", "created_at", "manifest_hash", "corpus_hash", "policy_version", "counts", "train_family_ids", "heldout_family_ids")}}

    def json_chunks(value, *, indent=None):
        for chunk in json.JSONEncoder(ensure_ascii=False, sort_keys=True, indent=indent).iterencode(value):
            yield chunk.encode("utf-8")

    def jsonl_chunks(records, split):
        for item in records:
            if item["split"] == split:
                yield from json_chunks(item)
                yield b"\n"

    archive = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024, mode="w+b")
    try:
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
            hashes = {}

            def write(name, chunks):
                digest = hashlib.sha256()
                with bundle.open(name, "w", force_zip64=True) as output:
                    for chunk in chunks:
                        digest.update(chunk)
                        output.write(chunk)
                hashes[name] = digest.hexdigest()

            for stage, records in (("cpt", original), ("sft", synthetic)):
                for split in ("train", "validation"):
                    write(f"{stage}/{split}.jsonl", jsonl_chunks(records, split))
            for name, value in metadata.items():
                write(name, json_chunks(value, indent=2))
            # The inventory hashes every payload file; it deliberately does not
            # attempt to recursively hash itself or the mutable ZIP container.
            write("hashes.json", json_chunks(dict(sorted(hashes.items())), indent=2))
        archive.seek(0)
    except BaseException:
        archive.close()
        raise
    return archive


def create_app(store: Store | None = None, *, enable_runtime: bool = True) -> FastAPI:
    @asynccontextmanager
    async def lifespan(application: FastAPI):
        own_store = store is None
        application.state.store = store or Store(os.environ.get("OBSERVATORY_DB", "./.observatory/state.sqlite3"))
        application.state.services = {}
        if enable_runtime:
            for name, class_name in (("research", "ResearchSupervisor"), ("training", "TrainingCoordinator")):
                try:
                    module = importlib.import_module("observatory." + name)
                    service = getattr(module, class_name)(application.state.store)
                    await service.start()
                    application.state.services[name] = service
                except ImportError as exc:
                    application.state.store.event("runtime.unavailable", f"{name} service unavailable: {type(exc).__name__}")
                except Exception as exc:
                    application.state.store.event("runtime.failed", f"{name} startup failed: {type(exc).__name__}")
        try:
            yield
        finally:
            for service in reversed(list(application.state.services.values())):
                await service.close()
            if own_store:
                application.state.store.close()

    application = FastAPI(title="Consciousness Research Observatory", lifespan=lifespan)

    def current_store(request: Request) -> Store:
        return request.app.state.store

    def owner(authorization: str | None = Header(default=None)) -> None:
        expected = os.environ.get("OBSERVATORY_ADMIN_TOKEN", "")
        if not expected:
            raise HTTPException(503, "Owner controls are disconnected; configure OBSERVATORY_ADMIN_TOKEN")
        supplied = authorization.removeprefix("Bearer ") if authorization and authorization.startswith("Bearer ") else ""
        if not supplied or not hmac.compare_digest(supplied.encode(), expected.encode()):
            raise HTTPException(401, "A valid owner Bearer token is required", headers={"WWW-Authenticate": "Bearer"})

    def service(request: Request, name: str):
        worker = request.app.state.services.get(name)
        if worker is None:
            raise HTTPException(503, f"{name.capitalize()} service is disconnected")
        return worker

    @application.exception_handler(ValueError)
    async def value_error(request: Request, exc: ValueError):
        return JSONResponse(status_code=422, content={"detail": request.app.state.store.sanitize(str(exc))})

    @application.get("/api/health")
    def health(request: Request):
        workers = {}
        for name, worker in request.app.state.services.items():
            task = getattr(worker, "task", None) or getattr(worker, "_task", None)
            workers[name] = {"running": task is not None and not task.done(),
                             "state": "not_started" if task is None else "stopped" if task.done() else "running"}
        return {"status": "ok", "services": sorted(request.app.state.services), "workers": workers,
                "owner_controls_configured": bool(os.environ.get("OBSERVATORY_ADMIN_TOKEN"))}

    @application.get("/api/state")
    def state(db: Store = Depends(current_store)):
        return db.state()

    @application.get("/api/research-models")
    async def research_models(db: Store = Depends(current_store)):
        try:
            async with asyncio.timeout(5):
                async with _broker_client() as broker:
                    payload = await broker.get_catalog()
            result = _public_catalog(payload, db)
        except Exception:
            result = {"status": "unavailable", "models": [], "network": None, "asset": None}
        return JSONResponse(result, headers={"Cache-Control": "no-store"})

    @application.get("/api/funding")
    async def funding():
        try:
            async with asyncio.timeout(5):
                async with _broker_client() as broker:
                    payload = await broker.get_funding()
            result = _public_funding(payload)
        except Exception:
            result = _public_funding({"status": "unknown", "configured": False})
        return JSONResponse(result, headers={"Cache-Control": "no-store"})

    @application.get("/api/admin/research-payments", dependencies=[Depends(owner)])
    def pending_research_payments(db: Store = Depends(current_store)):
        return JSONResponse({"pending": [_pending_payment_metadata(record, db) for record in db.pending_research_requests()]},
                            headers={"Cache-Control": "no-store"})

    async def inspect_research_payment(request_id: str, db: Store) -> dict:
        _request_id(request_id)
        try:
            async with asyncio.timeout(5):
                async with _broker_client() as broker:
                    payload = await broker.get_request(request_id)
        except Exception:
            raise HTTPException(503, "Payment broker inspection is unavailable; the pending request was retained") from None
        if not isinstance(payload, dict):
            raise HTTPException(502, "Payment broker returned an invalid inspection result")
        return _owner_payment_inspection(payload, request_id, db)

    @application.get("/api/admin/research-payments/{request_id}", dependencies=[Depends(owner)])
    async def research_payment(request_id: str, db: Store = Depends(current_store)):
        result = await inspect_research_payment(request_id, db)
        pending = next((item for item in db.pending_research_requests() if item["request_id"] == request_id), None)
        return JSONResponse({**result, "pending": _pending_payment_metadata(pending, db) if pending else None},
                            headers={"Cache-Control": "no-store"})

    @application.post("/api/admin/research-payments/{request_id}/acknowledge", dependencies=[Depends(owner)])
    async def acknowledge_research_payment(request_id: str, payload: dict = Body(...), db: Store = Depends(current_store)):
        _request_id(request_id)
        if set(payload) != {"reviewed"} or payload.get("reviewed") is not True:
            raise HTTPException(422, "Explicitly acknowledge inspection with reviewed: true")
        mission = db.get_mission()
        if mission.get("status") not in {"paused", "faulted", "stopped"}:
            raise HTTPException(409, "Pause or stop research before acknowledging a pending payment")
        pending = next((item for item in db.pending_research_requests() if item["request_id"] == request_id), None)
        if pending is None:
            raise HTTPException(404, "Pending research payment request not found")
        result = await inspect_research_payment(request_id, db)
        if result["in_flight"] or result["state"] not in {"completed", "settled_error", "reconciled", "intent", "not_found", "cancelled"}:
            raise HTTPException(409, "The payment outcome is unresolved or in flight; the pending request was retained")
        if result["state"] in {"intent", "cancelled"} and (result["payment"]["amount_atomic"] != "0" or result["payment"]["transaction"] is not None):
            raise HTTPException(409, "The unpaid intent is not definitively idle; the pending request was retained")
        if result["state"] in {"intent", "not_found", "cancelled"}:
            # A read alone cannot rule out an old delayed POST. The broker seals
            # this exact unpaid ID/body with a tombstone before we forget it.
            try:
                async with asyncio.timeout(5):
                    async with _broker_client() as broker:
                        abandoned = await broker.abandon_request(request_id, pending["protocol"], pending["body"])
            except Exception:
                raise HTTPException(409, "The broker could not seal the unpaid request; the pending request was retained") from None
            if (not isinstance(abandoned, dict) or abandoned.get("abandoned") is not True
                    or abandoned.get("in_flight") is not False or abandoned.get("request_id") != request_id
                    or abandoned.get("state") != "cancelled"):
                raise HTTPException(409, "The broker did not confirm an idle unpaid tombstone; the pending request was retained")
            result["state"] = "cancelled"
        with db._lock:
            current = db.get_mission()
            if current.get("id") != mission.get("id") or current.get("status") not in {"paused", "faulted", "stopped"}:
                raise HTTPException(409, "Research control changed during review; the pending request was retained")
            if not any(item["request_id"] == request_id for item in db.pending_research_requests()):
                raise HTTPException(404, "Pending research payment request not found")
            db.complete_research_request(request_id)
            db.event("research.payment_reviewed", "Owner reviewed a research payment outcome and cleared its pending caller intent",
                     data={"request_id": request_id, "state": result["state"]})
        return JSONResponse({"acknowledged": True, "request_id": request_id, "state": result["state"]},
                            headers={"Cache-Control": "no-store"})

    @application.get("/api/admin/datasets/{snapshot_id}/export", dependencies=[Depends(owner)])
    def export_dataset(snapshot_id: str, db: Store = Depends(current_store)):
        record = db.get("datasets", snapshot_id)
        if record is None:
            raise HTTPException(404, "Dataset snapshot not found")
        archive = _dataset_archive(record)
        filename = re.sub(r"[^A-Za-z0-9_-]", "_", snapshot_id)[:120] + ".zip"

        def chunks():
            try:
                while chunk := archive.read(1024 * 1024):
                    yield chunk
            finally:
                archive.close()
        return StreamingResponse(chunks(), media_type="application/zip", headers={"Cache-Control": "no-store", "Content-Disposition": f'attachment; filename="{filename}"'})

    @application.get("/api/events")
    async def events(request: Request, after: int = 0, last_event_id: str | None = Header(default=None), db: Store = Depends(current_store)):
        try:
            cursor = max(after, int(last_event_id or 0), 0)
        except ValueError:
            raise HTTPException(422, "Invalid event cursor") from None

        async def stream():
            nonlocal cursor
            heartbeat = 0
            while not await request.is_disconnected():
                batch = db.events_after(cursor)
                for event in batch:
                    cursor = event["seq"]
                    yield f"id: {cursor}\ndata: {json.dumps(event)}\n\n"
                heartbeat += 1
                if heartbeat >= 20:
                    yield ": heartbeat\n\n"
                    heartbeat = 0
                await asyncio.sleep(0.75)
        return StreamingResponse(stream(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @application.get("/api/agents/{agent_id}/frame")
    def frame(agent_id: str, db: Store = Depends(current_store)):
        agent = db.get("agents", agent_id)
        if not agent:
            raise HTTPException(404, "Agent not found")
        media = agent.get("frame_content_type", "image/png")
        if media not in {"image/png", "image/jpeg", "image/webp"}:
            raise HTTPException(422, "Unsupported screenshot type")
        if agent.get("frame_base64"):
            try:
                data = base64.b64decode(agent["frame_base64"], validate=True)
            except (ValueError, TypeError):
                raise HTTPException(422, "Invalid screenshot") from None
            if len(data) > 10 * 1024 * 1024:
                raise HTTPException(413, "Screenshot too large")
            return Response(data, media_type=media, headers={"Cache-Control": "no-store"})
        if agent.get("frame_path"):
            root = (db.path.parent / "frames").resolve()
            path = Path(agent["frame_path"]).resolve()
            if not path.is_relative_to(root) or not path.is_file():
                raise HTTPException(404, "Screenshot unavailable")
            return FileResponse(path, media_type=media, headers={"Cache-Control": "no-store"})
        raise HTTPException(404, "No browser screenshot has been collected")

    @application.post("/api/admin/settings", dependencies=[Depends(owner)])
    def settings(updates: dict = Body(...), db: Store = Depends(current_store)):
        result = db.save_settings(updates)
        db.event("settings.updated", "Owner configuration updated", data={"fields": sorted(updates)})
        return result

    @application.post("/api/admin/missions/{action}", dependencies=[Depends(owner)])
    def mission(action: str, updates: dict = Body(default={}), db: Store = Depends(current_store)):
        previous = db.get_mission()
        statuses = {"start": "running", "pause": "pausing", "resume": "running", "stop": "stopping"}
        if action not in statuses:
            raise HTTPException(404, "Unknown mission action")
        if action in {"start", "resume"}:
            from .research_llm import validate_research_settings
            from .x402_client import ResearchPermanentError
            try:
                validate_research_settings(db.get_settings(private=True))
            except ResearchPermanentError as exc:
                raise HTTPException(422, db.sanitize(str(exc))) from None
        if action == "start" and previous.get("status") in {"stopped", "failed"}:
            previous = {"id": str(uuid4()), "created_at": utc_now()}
        payload = {**previous, **{key: value for key, value in updates.items() if key not in {"id", "status"}},
                   "id": previous.get("id") or str(uuid4()), "status": statuses[action], "until_stopped": True}
        payload.setdefault("objective", "Research AI consciousness, sentience, pain and moral patienthood using primary evidence and competing interpretations.")
        result = db.set_mission(payload)
        db.event("mission." + action, f"Mission {action} requested", run_id=result["id"])
        return db.sanitize(result)

    @application.post("/api/admin/snapshots", dependencies=[Depends(owner)])
    def snapshot(db: Store = Depends(current_store)):
        return db.sanitize(build_snapshot(db))

    @application.post("/api/admin/train", dependencies=[Depends(owner)])
    async def train(request: Request, payload: dict = Body(default={}), db: Store = Depends(current_store)):
        worker = service(request, "training")
        if payload.get("stage") == "sft":
            if not payload.get("parent_run_id"):
                raise HTTPException(422, "SFT requires parent_run_id")
            result = await worker.submit_sft(payload["parent_run_id"], snapshot_id=payload.get("snapshot_id"), retry=payload.get("retry") is True)
        else:
            result = await worker.submit(snapshot_id=payload.get("snapshot_id"), retry=payload.get("retry") is True)
        return db.sanitize(result)

    @application.post("/api/admin/train/{run_id}/cancel", dependencies=[Depends(owner)])
    async def cancel(run_id: str, request: Request, db: Store = Depends(current_store)):
        return db.sanitize(await service(request, "training").cancel(run_id))

    @application.post("/api/admin/checkpoints/{checkpoint_id}/activate", dependencies=[Depends(owner)])
    async def activate(checkpoint_id: str, request: Request, db: Store = Depends(current_store)):
        return db.sanitize(await service(request, "training").activate(checkpoint_id))

    def review_source(source_id: str, updates: dict, db: Store) -> dict:
        source = db.get("sources", source_id)
        if not source:
            raise HTTPException(404, "Source not found")
        allowed = {"review_status", "rights_status", "review_note", "rights_evidence", "permission_evidence", "license", "license_verified", "split", "held_out"}
        if (updates.get("license_verified") or updates.get("rights_status") == "permission_granted") and not (
            updates.get("rights_evidence") or updates.get("permission_evidence") or source.get("rights_evidence")
        ):
            raise HTTPException(422, "Rights verification requires recorded evidence")
        source.update({key: value for key, value in updates.items() if key in allowed})
        source["curation"] = eligibility(source)
        db.put("sources", source)
        db.event("source.reviewed", "Owner reviewed a source", data={"source_id": source_id, "curation": source["curation"]})
        return db.sanitize(source)

    @application.post("/api/admin/sources/{source_id}/review", dependencies=[Depends(owner)])
    @application.patch("/api/admin/sources/{source_id}", dependencies=[Depends(owner)])
    def review(source_id: str, updates: dict = Body(...), db: Store = Depends(current_store)):
        return review_source(source_id, updates, db)

    @application.post("/api/admin/notes", dependencies=[Depends(owner)])
    def add_note(payload: dict = Body(...), db: Store = Depends(current_store)):
        if not isinstance(payload.get("text"), str) or not payload["text"].strip():
            raise HTTPException(422, "A note needs text")
        note = db.put("notes", {"source_id": payload.get("source_id"), "agent_id": payload.get("agent_id"),
                                "text": payload["text"], "type": payload.get("type", "owner_note"), "generated_by": "owner"})
        db.event("note.saved", "Owner saved a research note", data={"note_id": note["id"]})
        return db.sanitize(note, strip_content=False)

    @application.patch("/api/admin/notes/{note_id}", dependencies=[Depends(owner)])
    def edit_note(note_id: str, updates: dict = Body(...), db: Store = Depends(current_store)):
        note = db.get("notes", note_id)
        if not note:
            raise HTTPException(404, "Note not found")
        for key in ("bookmarked", "text", "review_status"):
            if key in updates:
                note[key] = updates[key]
        return db.sanitize(db.put("notes", note), strip_content=False)

    @application.get("/")
    def home():
        return RedirectResponse("/observatory.html?api=/api")

    @application.get("/observatory.html")
    def page():
        return FileResponse(SITE / "observatory.html")

    @application.get("/index.html")
    def wirehead_home():
        return RedirectResponse("https://wirehead.agency/", status_code=307)

    @application.get("/live.html")
    def current_chamber():
        return RedirectResponse("https://wirehead.agency/live.html", status_code=307)

    @application.get("/{asset}")
    def static_asset(asset: str):
        if asset not in {"observatory.css", "observatory-fonts.css", "observatory.js", "observatory-preview.js", "grimoire.css", "favicon.svg", "icon.svg"}:
            raise HTTPException(404, "Not found")
        return FileResponse(SITE / asset)

    @application.get("/assets/fonts/{filename}")
    def font_asset(filename: str):
        allowed = {
            "cormorant-garamond-latin-normal.woff2", "cormorant-garamond-latin-500-italic.woff2",
            "ibm-plex-mono-latin-400-normal.woff2", "ibm-plex-mono-latin-500-normal.woff2",
            "ibm-plex-mono-latin-600-normal.woff2",
        }
        if filename not in allowed:
            raise HTTPException(404, "Not found")
        return FileResponse(SITE / "assets" / "fonts" / filename, media_type="font/woff2")

    return application


app = create_app()
