import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AudioSession, Note
from ..schemas import NoteCreate, NoteUpdate
from ..services.note_service import create_note, serialize_note, update_note
from ..services.audio_service import pop_session_baseline
from ..services.openai_service import decorate_note_content, format_transcript, transcribe_audio
from ..services.settings_service import get_bool

router = APIRouter(prefix="/api/ai", tags=["ai"])
RAW_ORIGINAL_HEADING = "## Raw Original"


def _get_note(db: Session, note_id: int) -> Note:
    note = db.get(Note, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


def _strip_raw_original_section(content: str) -> str:
    marker = f"\n{RAW_ORIGINAL_HEADING}"
    if marker in content:
        head = content.split(marker, 1)[0].rstrip()
        return re.sub(r"\n\s*(-{3,}|_{3,}|\*{3,})\s*$", "", head).rstrip()
    if content.startswith(RAW_ORIGINAL_HEADING):
        return ""
    return content.strip()


def _raw_original_for_note(note: Note, fallback: str) -> str:
    raw = (note.raw_transcript or note.clean_transcript or "").strip()
    return raw or _strip_raw_original_section(fallback)


def _append_raw_original(decorated_markdown: str, raw_original: str) -> str:
    decorated = _strip_raw_original_section(decorated_markdown)
    raw = raw_original.strip()
    if not raw:
        return decorated
    return f"{decorated}\n\n---\n\n{RAW_ORIGINAL_HEADING}\n\n{raw}".strip()


def _append_transcript(existing: str, addition: str) -> str:
    existing_text = existing.strip()
    addition_text = addition.strip()
    if not existing_text:
        return addition_text
    if not addition_text or existing_text.endswith(addition_text):
        return existing_text
    return f"{existing_text}\n\n{addition_text}"


def _recording_baseline(db: Session, note: Note) -> str:
    if not note.audio_path:
        return ""
    session = (
        db.query(AudioSession)
        .filter(AudioSession.note_id == note.id, AudioSession.file_path == note.audio_path)
        .order_by(AudioSession.id.desc())
        .first()
    )
    return pop_session_baseline(session.session_id) if session else ""


@router.post("/transcribe/{note_id}")
def transcribe(note_id: int, db: Session = Depends(get_db)):
    note = _get_note(db, note_id)
    if not note.audio_path:
        raise HTTPException(status_code=400, detail="No audio file attached to this note.")
    try:
        note.status = "processing"
        db.commit()
        transcript = transcribe_audio(db, note.audio_path)
        combined_transcript = _append_transcript(_recording_baseline(db, note), transcript)
        update_note(
            db,
            note,
            NoteUpdate(raw_transcript=combined_transcript, clean_transcript=combined_transcript, plain_text=combined_transcript, status="saved"),
            create_version=False,
        )
        if get_bool(db, "delete_audio_after_transcription", False) and note.audio_path:
            Path(note.audio_path).unlink(missing_ok=True)
            note.audio_path = None
            db.commit()
    except Exception as exc:
        note.status = "failed"
        db.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"raw_transcript": combined_transcript, "note": serialize_note(note)}


@router.post("/format/{note_id}")
def format_note(note_id: int, db: Session = Depends(get_db)):
    note = _get_note(db, note_id)
    transcript = note.raw_transcript or note.clean_transcript
    if not transcript:
        raise HTTPException(status_code=400, detail="No transcript available to format.")
    try:
        note.status = "processing"
        db.commit()
        formatted = format_transcript(db, transcript, note.note_type)
        raw_original = transcript.strip()
        formatted_markdown = _append_raw_original(formatted.structured_markdown, raw_original)
        update_note(
            db,
            note,
            NoteUpdate(
                title=formatted.title or note.title,
                note_type=formatted.note_type,
                summary=formatted.summary,
                tags=formatted.tags,
                clean_transcript=raw_original,
                structured_content=formatted_markdown,
                markdown_content=formatted_markdown,
                plain_text=raw_original,
                status="saved",
            ),
            create_version=False,
        )
    except Exception as exc:
        note.status = "failed"
        db.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"formatted": formatted.model_dump(), "note": serialize_note(note)}


@router.post("/decorate/{note_id}")
def decorate_note(note_id: int, db: Session = Depends(get_db)):
    note = _get_note(db, note_id)
    existing_content = (
        note.markdown_content
        or note.structured_content
        or note.plain_text
        or note.clean_transcript
        or note.raw_transcript
        or ""
    ).strip()
    content = _strip_raw_original_section(existing_content)
    if not content:
        raise HTTPException(status_code=400, detail="There is no note content to decorate yet.")
    try:
        decorated = decorate_note_content(db, content, note.note_type)
        raw_original = _raw_original_for_note(note, existing_content)
        decorated_markdown = _append_raw_original(decorated.structured_markdown, raw_original)
        decorated_note = create_note(
            db,
            NoteCreate(
                title=f"{decorated.title or note.title} (Decorated)",
                note_type=decorated.note_type,
                raw_transcript=raw_original,
                clean_transcript=raw_original,
                structured_content=decorated_markdown,
                markdown_content=decorated_markdown,
                plain_text=raw_original,
                summary="",
                tags=decorated.tags,
                status="saved",
            ),
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"decorated": decorated.model_dump(), "note": serialize_note(decorated_note)}
