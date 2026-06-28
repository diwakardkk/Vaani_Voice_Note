import uuid
from datetime import datetime
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from ..config import AUDIO_DIR
from ..models import AudioSession, Note


def extension_from_mime(mime_type: str | None) -> str:
    if not mime_type:
        return ".webm"
    if "mp4" in mime_type:
        return ".m4a"
    if "mpeg" in mime_type or "mp3" in mime_type:
        return ".mp3"
    if "wav" in mime_type:
        return ".wav"
    return ".webm"


def start_audio_session(db: Session, note_id: int, mime_type: str | None) -> AudioSession:
    session_id = uuid.uuid4().hex
    file_name = f"note-{note_id}-{session_id}{extension_from_mime(mime_type)}"
    path = AUDIO_DIR / file_name
    path.touch(exist_ok=False)
    session = AudioSession(session_id=session_id, note_id=note_id, file_path=str(path), status="recording")
    db.add(session)
    note = db.get(Note, note_id)
    if note:
        note.audio_path = str(path)
        note.status = "recording"
    db.commit()
    db.refresh(session)
    return session


async def append_chunk(db: Session, session_id: str, chunk: UploadFile) -> int:
    session = db.query(AudioSession).filter(AudioSession.session_id == session_id).first()
    if not session:
        raise ValueError("Audio session not found")
    data = await chunk.read()
    with Path(session.file_path).open("ab") as handle:
        handle.write(data)
    return len(data)


def finish_audio_session(db: Session, session_id: str) -> AudioSession:
    session = db.query(AudioSession).filter(AudioSession.session_id == session_id).first()
    if not session:
        raise ValueError("Audio session not found")
    session.status = "finished"
    session.finished_at = datetime.utcnow()
    note = db.get(Note, session.note_id)
    if note:
        note.audio_path = session.file_path
        note.status = "processing"
        note.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session
