from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import AudioFinishRequest, AudioStartRequest
from ..services.audio_service import append_chunk, finish_audio_session, start_audio_session

router = APIRouter(prefix="/api/audio", tags=["audio"])


@router.post("/start")
def start(payload: AudioStartRequest, db: Session = Depends(get_db)):
    try:
        session = start_audio_session(db, payload.note_id, payload.mime_type)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"session_id": session.session_id, "note_id": session.note_id, "file_name": session.file_path}


@router.post("/chunk")
async def chunk(session_id: str = Form(...), chunk_file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        bytes_written = await append_chunk(db, session_id, chunk_file)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True, "bytes_written": bytes_written}


@router.post("/finish")
def finish(payload: AudioFinishRequest, db: Session = Depends(get_db)):
    try:
        session = finish_audio_session(db, payload.session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True, "note_id": session.note_id, "audio_path": session.file_path}
