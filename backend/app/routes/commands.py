from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import CommandParseRequest
from ..services.command_service import parse_command

router = APIRouter(prefix="/api/commands", tags=["commands"])


@router.post("/parse")
def parse(payload: CommandParseRequest, db: Session = Depends(get_db)):
    return parse_command(db, payload.command_text, payload.current_note_context)
