import json
from datetime import datetime
from html.parser import HTMLParser

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models import Note, NoteVersion
from ..schemas import NOTE_TYPES, NoteCreate, NoteUpdate


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        if data.strip():
            self.parts.append(data.strip())


def html_to_text(html: str | None) -> str:
    if not html:
        return ""
    parser = _TextExtractor()
    parser.feed(html)
    return "\n".join(parser.parts)


def tags_from_json(tags_json: str | None) -> list[str]:
    if not tags_json:
        return []
    try:
        data = json.loads(tags_json)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def serialize_note(note: Note) -> dict:
    return {
        "id": note.id,
        "title": note.title,
        "note_type": note.note_type,
        "raw_transcript": note.raw_transcript,
        "clean_transcript": note.clean_transcript,
        "structured_content": note.structured_content,
        "plain_text": note.plain_text,
        "html_content": note.html_content,
        "markdown_content": note.markdown_content,
        "summary": note.summary,
        "tags": tags_from_json(note.tags_json),
        "audio_path": note.audio_path,
        "status": note.status,
        "created_at": note.created_at,
        "updated_at": note.updated_at,
        "deleted_at": note.deleted_at,
        "is_deleted": note.is_deleted,
    }


def create_note(db: Session, payload: NoteCreate) -> Note:
    note = Note(
        title=payload.title or "Untitled voice note",
        note_type=payload.note_type if payload.note_type in NOTE_TYPES else "General Note",
        raw_transcript=payload.raw_transcript,
        clean_transcript=payload.clean_transcript,
        structured_content=payload.structured_content,
        plain_text=payload.plain_text,
        html_content=payload.html_content,
        markdown_content=payload.markdown_content,
        summary=payload.summary,
        tags_json=json.dumps(payload.tags or []),
        status=payload.status or "saved",
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def update_note(db: Session, note: Note, payload: NoteUpdate, create_version: bool = True) -> Note:
    data = payload.model_dump(exclude_unset=True)
    if create_version and any(key in data for key in ("html_content", "markdown_content", "structured_content")):
        existing = note.markdown_content or note.html_content or note.structured_content or ""
        if existing:
            db.add(NoteVersion(note_id=note.id, content=existing))
    if "tags" in data:
        note.tags_json = json.dumps(data.pop("tags") or [])
    for key, value in data.items():
        if value is not None and hasattr(note, key):
            setattr(note, key, value)
    if payload.html_content and not payload.plain_text:
        note.plain_text = html_to_text(payload.html_content)
    note.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(note)
    return note


def list_notes(db: Session, q: str | None = None, include_deleted: bool = False) -> list[Note]:
    query = db.query(Note)
    if not include_deleted:
        query = query.filter(Note.is_deleted.is_(False))
    if q:
        needle = f"%{q.lower()}%"
        query = query.filter(
            or_(
                Note.title.ilike(needle),
                Note.note_type.ilike(needle),
                Note.raw_transcript.ilike(needle),
                Note.structured_content.ilike(needle),
                Note.plain_text.ilike(needle),
                Note.tags_json.ilike(needle),
            )
        )
    return query.order_by(Note.updated_at.desc()).all()


def soft_delete(db: Session, note: Note) -> Note:
    note.is_deleted = True
    note.deleted_at = datetime.utcnow()
    note.updated_at = datetime.utcnow()
    note.status = "saved"
    db.commit()
    db.refresh(note)
    return note


def restore_note(db: Session, note: Note) -> Note:
    note.is_deleted = False
    note.deleted_at = None
    note.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(note)
    return note
