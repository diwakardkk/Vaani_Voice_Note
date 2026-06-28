import json
import re
from typing import Any

from sqlalchemy.orm import Session

from ..models import CommandsLog
from ..schemas import CommandParseResponse, NOTE_TYPES
from .settings_service import get_api_key
from ..config import settings


DANGEROUS_ACTIONS = {"delete_note", "permanent_delete_note", "overwrite_note", "export_note"}


def _strip_wake_word(command_text: str) -> tuple[str, bool]:
    match = re.search(r"\bvaani\b[:,]?\s*", command_text, flags=re.IGNORECASE)
    if not match:
        return command_text.strip(), False
    return command_text[match.end() :].strip(), True


def _rule_based(command_text: str) -> CommandParseResponse:
    cleaned, _ = _strip_wake_word(command_text)
    text = cleaned.strip().lower()
    if ("save" in text and ("new note" in text or "start new note" in text or "create new note" in text)) or (
        "save this" in text and "start" in text and "note" in text
    ):
        return CommandParseResponse(action="save_and_new_note")
    if text in {"save", "save this", "save note", "save this note"}:
        return CommandParseResponse(action="save_note")
    if "stop recording" in text:
        return CommandParseResponse(action="stop_recording")
    if "start recording" in text or "record" in text:
        return CommandParseResponse(action="start_recording")
    if "new note" in text or "start new note" in text or "create new note" in text:
        return CommandParseResponse(action="create_note")
    if text.startswith("search") or text.startswith("find"):
        query = re.sub(r"^(search|find)( notes)?( about| where| for)?", "", text).strip()
        return CommandParseResponse(action="search_notes", parameters={"query": query})
    if "open last" in text:
        return CommandParseResponse(action="open_note", parameters={"mode": "last"})
    if "delete" in text:
        return CommandParseResponse(
            action="delete_note",
            requires_confirmation=True,
            confirmation_phrase="Yes delete",
        )
    if "export" in text:
        fmt = "pdf" if "pdf" in text else "markdown" if "markdown" in text else "txt"
        return CommandParseResponse(
            action="export_note",
            parameters={"format": fmt},
            requires_confirmation="doctor" in text,
            confirmation_phrase="Yes export",
        )
    if "summarize" in text:
        return CommandParseResponse(action="summarize_note")
    for note_type in NOTE_TYPES:
        if note_type.lower().replace(" note", "") in text and ("convert" in text or "make" in text):
            return CommandParseResponse(action="change_note_type", parameters={"note_type": note_type})
    return CommandParseResponse(action="update_note", parameters={"instruction": command_text})


def parse_command(db: Session, command_text: str, context: str | None = None) -> CommandParseResponse:
    normalized_command, has_wake_word = _strip_wake_word(command_text)
    rule_match = _rule_based(normalized_command)
    if has_wake_word and rule_match.action != "update_note":
        db.add(CommandsLog(command_text=command_text, parsed_action=rule_match.model_dump_json(), status="parsed"))
        db.commit()
        return rule_match
    api_key = get_api_key(db)
    parsed = None
    if api_key:
        try:
            from openai import OpenAI

            client = OpenAI(api_key=api_key)
            response = client.chat.completions.create(
                model=settings.openai_chat_model,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Parse commands for a local voice note app. Return strict JSON with "
                            "action, parameters, requires_confirmation, confirmation_phrase. "
                            "Dangerous actions require confirmation."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Context: {context or ''}\nCommand: {normalized_command}\n"
                            "If the user says save and start/create a new note, use action save_and_new_note. "
                            "If the user asks for a new note, use action create_note."
                        ),
                    },
                ],
                temperature=0,
            )
            data: dict[str, Any] = json.loads(response.choices[0].message.content or "{}")
            parsed = CommandParseResponse.model_validate(data)
            if parsed.action in DANGEROUS_ACTIONS and not parsed.requires_confirmation:
                parsed.requires_confirmation = True
                parsed.confirmation_phrase = parsed.confirmation_phrase or "Yes confirm"
        except Exception:
            parsed = None
    if parsed is None:
        parsed = rule_match
    db.add(CommandsLog(command_text=command_text, parsed_action=parsed.model_dump_json(), status="parsed"))
    db.commit()
    return parsed
