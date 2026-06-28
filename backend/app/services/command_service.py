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
    match = re.search(r"\b(?:hey\s+)?jojo\b[:,]?\s*", command_text, flags=re.IGNORECASE)
    if not match:
        return command_text.strip(), False
    return command_text[match.end() :].strip(), True


def _extract_title(text: str) -> str | None:
    patterns = [
        r"(?:titled|title|called|named)\s+['\"]?(.+?)(?:\s+as\s+(?:pdf|markdown|txt|html))?['\"]?$",
        r"(?:open|delete|decorate|export|download)\s+(?:note\s+)?['\"]?(.+?)(?:\s+as\s+(?:pdf|markdown|txt|html))?['\"]?$",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            title = match.group(1).strip(" .'\"")
            return title or None
    return None


def _extract_after(text: str, pattern: str) -> str | None:
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match:
        return None
    value = match.group(1).strip(" .'\"")
    return value or None


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
    if "pause recording" in text or text == "pause":
        return CommandParseResponse(action="pause_recording")
    if "resume recording" in text or text == "resume":
        return CommandParseResponse(action="resume_recording")
    if "start recording" in text or "record" in text:
        return CommandParseResponse(action="start_recording")
    if "new note" in text or "start new note" in text or "create new note" in text:
        return CommandParseResponse(action="create_note")
    if "decorate" in text or "decoration" in text or "format this" in text or "make professional" in text:
        title = _extract_title(cleaned) if "this" not in text and "current" not in text else None
        return CommandParseResponse(action="decorate_note", parameters={"title": title} if title else {})
    if text.startswith("search") or text.startswith("find"):
        query = re.sub(r"^(search|find)( notes)?( about| where| for)?", "", text).strip()
        return CommandParseResponse(action="search_notes", parameters={"query": query})
    if "open last" in text:
        return CommandParseResponse(action="open_note", parameters={"mode": "last"})
    if text.startswith("open") or "open note" in text:
        title = _extract_title(cleaned)
        return CommandParseResponse(action="open_note", parameters={"title": title} if title else {})
    rename_specific = re.search(r"rename\s+(?:note\s+)?(.+?)\s+to\s+(.+)$", cleaned, flags=re.IGNORECASE)
    if rename_specific and rename_specific.group(1).strip().lower() not in {"this", "this note", "current", "current note"}:
        return CommandParseResponse(
            action="rename_note",
            parameters={
                "target_title": rename_specific.group(1).strip(" .'\""),
                "title": rename_specific.group(2).strip(" .'\""),
            },
        )
    rename_title = _extract_after(cleaned, r"(?:rename(?: this note)? to|change title to|set title to)\s+(.+)$")
    if rename_title:
        return CommandParseResponse(action="rename_note", parameters={"title": rename_title})
    if "delete" in text:
        title = _extract_title(cleaned) if "this" not in text and "current" not in text else None
        return CommandParseResponse(
            action="delete_note",
            parameters={"title": title} if title else {},
            requires_confirmation=True,
            confirmation_phrase="Yes delete",
        )
    if "export" in text or "download" in text:
        fmt = "pdf" if "pdf" in text else "markdown" if "markdown" in text else "txt"
        title = None if re.search(r"\b(this|current|it)\b", text) else _extract_title(cleaned)
        return CommandParseResponse(
            action="export_note",
            parameters={"format": fmt, **({"title": title} if title else {})},
            requires_confirmation="doctor" in text,
            confirmation_phrase="Yes export",
        )
    if "summarize" in text:
        return CommandParseResponse(action="summarize_note")
    translate_target = _extract_after(cleaned, r"(?:translate(?: this note)?(?: to| in)\s+)(.+)$")
    if translate_target or text.startswith("translate"):
        return CommandParseResponse(action="translate_note", parameters={"target_language": translate_target or "English"})
    for note_type in NOTE_TYPES:
        if note_type.lower().replace(" note", "") in text and ("convert" in text or "make" in text):
            return CommandParseResponse(action="change_note_type", parameters={"note_type": note_type})
    update_content = _extract_after(cleaned, r"(?:add|append|update(?: this note)? with)\s+(.+)$")
    if update_content:
        return CommandParseResponse(action="update_note", parameters={"mode": "append", "content": update_content})
    return CommandParseResponse(action="update_note", parameters={"instruction": command_text})


def parse_command(db: Session, command_text: str, context: str | None = None) -> CommandParseResponse:
    normalized_command, has_wake_word = _strip_wake_word(command_text)
    rule_match = _rule_based(normalized_command)
    if has_wake_word and (rule_match.action != "update_note" or "content" in rule_match.parameters):
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
                            "If the user asks for a new note, use action create_note. "
                            "Supported actions: create_note, save_note, save_and_new_note, open_note, search_notes, "
                            "delete_note, decorate_note, translate_note, export_note, rename_note, update_note, summarize_note, "
                            "change_note_type, start_recording, stop_recording, pause_recording, resume_recording. "
                            "For delete use requires_confirmation true with confirmation_phrase Yes delete."
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
