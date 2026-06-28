from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Note
from ..schemas import NoteCreate, NoteUpdate
from ..services.note_service import create_note, list_notes, restore_note, serialize_note, soft_delete, update_note

router = APIRouter(prefix="/api/notes", tags=["notes"])


def _get_note(db: Session, note_id: int) -> Note:
    note = db.get(Note, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@router.get("")
def get_notes(q: str | None = Query(None), include_deleted: bool = False, db: Session = Depends(get_db)):
    return [serialize_note(note) for note in list_notes(db, q, include_deleted)]


@router.get("/{note_id}")
def get_note(note_id: int, db: Session = Depends(get_db)):
    return serialize_note(_get_note(db, note_id))


@router.post("")
def post_note(payload: NoteCreate, db: Session = Depends(get_db)):
    return serialize_note(create_note(db, payload))


@router.put("/{note_id}")
def put_note(note_id: int, payload: NoteUpdate, db: Session = Depends(get_db)):
    note = _get_note(db, note_id)
    return serialize_note(update_note(db, note, payload))


@router.delete("/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    note = _get_note(db, note_id)
    return serialize_note(soft_delete(db, note))


@router.post("/{note_id}/restore")
def restore(note_id: int, db: Session = Depends(get_db)):
    note = _get_note(db, note_id)
    return serialize_note(restore_note(db, note))
