"""Standalone observatory API; no chamber model or live.server imports."""
from __future__ import annotations

import asyncio
import base64
from contextlib import asynccontextmanager
import hmac
import importlib
import json
import os
from pathlib import Path
from uuid import uuid4

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response, StreamingResponse

from .curation import build_snapshot, eligibility
from .store import Store, utc_now

SITE = Path(__file__).resolve().parents[1] / "site"


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
        return {"status": "ok", "services": sorted(request.app.state.services),
                "owner_controls_configured": bool(os.environ.get("OBSERVATORY_ADMIN_TOKEN"))}

    @application.get("/api/state")
    def state(db: Store = Depends(current_store)):
        return db.state()

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
