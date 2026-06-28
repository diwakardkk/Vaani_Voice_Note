from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Note
from ..schemas import ExportRequest
from ..services.export_service import export_note

router = APIRouter(prefix="/api/export", tags=["export"])


@router.post("/{note_id}")
def export(note_id: int, payload: ExportRequest, db: Session = Depends(get_db)):
    note = db.get(Note, note_id)
    if not note or note.is_deleted:
        raise HTTPException(status_code=404, detail="Note not found")
    try:
        filename, path = export_note(note, payload.format)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"file_name": filename, "file_path": str(path), "download_url": f"/api/export/download/{filename}"}


@router.get("/download/{file_name}")
def download(file_name: str):
    from ..config import EXPORTS_DIR

    path = EXPORTS_DIR / file_name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Export not found")
    return FileResponse(str(path), filename=file_name)
