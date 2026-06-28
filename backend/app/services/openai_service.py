import json
from pathlib import Path

from openai import OpenAI
from pydantic import ValidationError
from sqlalchemy.orm import Session

from ..config import settings
from ..schemas import AIFormatResponse, NOTE_TYPES
from .settings_service import get_api_key


SYSTEM_PROMPT = """You convert raw voice transcripts into clean local-first notes.
Return only strict JSON matching the requested schema.
Use one allowed note_type value as a string, never as an array.
Preserve the user's original language. Never translate the transcript.
Do not paraphrase, rewrite, or rephrase the original content.
For clean_transcript, keep the same words as the transcript except for obvious duplicated filler caused by speech recognition.
For structured_markdown, organize the original wording with headings/bullets, but do not translate or rewrite the user's sentences.
For Doctor Note, add the sentence "AI prepared draft. Doctor review required." to warnings_or_missing_info.
Do not invent facts. Put missing or uncertain details in warnings_or_missing_info."""


def _client(db: Session) -> OpenAI:
    api_key = get_api_key(db)
    if not api_key:
        raise RuntimeError("OpenAI API key is not set. Add it in Settings or backend/.env.")
    return OpenAI(api_key=api_key)


def _normalize_ai_note_payload(data: dict, fallback_type: str = "General Note") -> dict:
    note_type = data.get("note_type")
    if isinstance(note_type, list):
        note_type = next((item for item in note_type if isinstance(item, str) and item in NOTE_TYPES), None)
    if not isinstance(note_type, str) or note_type not in NOTE_TYPES:
        note_type = fallback_type if fallback_type in NOTE_TYPES else "General Note"
    data["note_type"] = note_type
    for key in ("tags", "action_items", "important_points", "warnings_or_missing_info"):
        value = data.get(key)
        if value is None:
            data[key] = []
        elif not isinstance(value, list):
            data[key] = [str(value)]
    for key in ("title", "summary", "clean_transcript", "structured_markdown"):
        value = data.get(key)
        if value is None:
            data[key] = ""
        elif not isinstance(value, str):
            data[key] = str(value)
    return data


def transcribe_audio(db: Session, audio_path: str) -> str:
    path = Path(audio_path)
    if not path.exists() or path.stat().st_size == 0:
        raise RuntimeError("Audio file is empty or missing.")
    client = _client(db)
    with path.open("rb") as audio_file:
        result = client.audio.transcriptions.create(
            model=settings.openai_transcription_model,
            file=audio_file,
            prompt="Transcribe in the same language or mixed languages spoken by the user. Do not translate.",
        )
    return getattr(result, "text", "") or str(result)


def format_transcript(db: Session, transcript: str, current_type: str = "General Note") -> AIFormatResponse:
    client = _client(db)
    schema_hint = {
        "title": "",
        "note_type": "General Note",
        "summary": "",
        "tags": [],
        "clean_transcript": "",
        "structured_markdown": "",
        "action_items": [],
        "important_points": [],
        "warnings_or_missing_info": [],
    }
    response = client.chat.completions.create(
        model=settings.openai_chat_model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Current note type hint: {current_type}\n"
                    f"Allowed note types: {', '.join(NOTE_TYPES)}\n"
                    f"JSON schema hint: {json.dumps(schema_hint)}\n\n"
                    f"Transcript:\n{transcript}"
                ),
            },
        ],
        temperature=0.2,
    )
    content = response.choices[0].message.content or "{}"
    try:
        data = _normalize_ai_note_payload(json.loads(content), current_type)
        parsed = AIFormatResponse.model_validate(data)
    except (json.JSONDecodeError, ValidationError) as exc:
        raise RuntimeError(f"AI returned invalid note JSON: {exc}") from exc
    if parsed.note_type not in NOTE_TYPES:
        parsed.note_type = "General Note"
    return parsed


def decorate_note_content(db: Session, content: str, current_type: str = "General Note") -> AIFormatResponse:
    client = _client(db)
    schema_hint = {
        "title": "",
        "note_type": "General Note",
        "summary": "",
        "tags": [],
        "clean_transcript": "",
        "structured_markdown": "",
        "action_items": [],
        "important_points": [],
        "warnings_or_missing_info": [],
    }
    response = client.chat.completions.create(
        model=settings.openai_chat_model,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a careful note editor for VaaniNotes AI. Decorate and organize the user's note "
                    "without translating, paraphrasing, or changing the user's original wording. "
                    "Preserve the original language exactly. Use clear headings, short paragraphs, bullet points, checklists, "
                    "tables only when useful, and a polished professional structure. Do not summarize the note. "
                    "Do not add highlights, important points, action items, or conclusions unless those sections already exist in the content. "
                    "For clean_transcript, return the original note content exactly as provided, not a rewritten version. "
                    "For structured_markdown, arrange the original sentences under headings/bullets without rewriting them. "
                    "Do not add a Raw Original or raw transcript section yourself; the app will append it after your output. "
                    "Return only strict JSON matching the schema. note_type must be one string, not an array. For Doctor Note include "
                    '"AI prepared draft. Doctor review required." in warnings_or_missing_info.'
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Current note type hint: {current_type}\n"
                    f"Allowed note types: {', '.join(NOTE_TYPES)}\n"
                    f"JSON schema hint: {json.dumps(schema_hint)}\n\n"
                    "Decorate this note content:\n"
                    f"{content}"
                ),
            },
        ],
        temperature=0.25,
    )
    content_json = response.choices[0].message.content or "{}"
    try:
        data = _normalize_ai_note_payload(json.loads(content_json), current_type)
        parsed = AIFormatResponse.model_validate(data)
    except (json.JSONDecodeError, ValidationError) as exc:
        raise RuntimeError(f"AI returned invalid decorated note JSON: {exc}") from exc
    if parsed.note_type not in NOTE_TYPES:
        parsed.note_type = "General Note"
    return parsed
