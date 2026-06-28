from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


NOTE_TYPES = [
    "Book Writing",
    "Doctor Note",
    "Student Note",
    "Business Note",
    "Research Note",
    "Meeting Note",
    "Personal Note",
    "General Note",
]


class NoteBase(BaseModel):
    title: str | None = None
    note_type: str | None = None
    raw_transcript: str | None = None
    clean_transcript: str | None = None
    structured_content: str | None = None
    plain_text: str | None = None
    html_content: str | None = None
    markdown_content: str | None = None
    summary: str | None = None
    tags: list[str] | None = None
    status: str | None = None


class NoteCreate(NoteBase):
    title: str = "Untitled voice note"
    note_type: str = "General Note"


class NoteUpdate(NoteBase):
    pass


class NoteOut(NoteBase):
    id: int
    title: str
    note_type: str
    tags: list[str] = []
    audio_path: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None
    is_deleted: bool

    class Config:
        from_attributes = True


class AudioStartRequest(BaseModel):
    note_id: int
    mime_type: str | None = "audio/webm"


class AudioStartResponse(BaseModel):
    session_id: str
    note_id: int
    file_name: str


class AudioFinishRequest(BaseModel):
    session_id: str


class AIFormatResponse(BaseModel):
    title: str
    note_type: str
    summary: str
    tags: list[str]
    clean_transcript: str
    structured_markdown: str
    action_items: list[str] = []
    important_points: list[str] = []
    warnings_or_missing_info: list[str] = []


class CommandParseRequest(BaseModel):
    command_text: str
    current_note_id: int | None = None
    current_note_context: str | None = None


class CommandParseResponse(BaseModel):
    action: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    requires_confirmation: bool = False
    confirmation_phrase: str = ""


class ExportRequest(BaseModel):
    format: Literal["markdown", "txt", "html", "pdf"]


class ExportResponse(BaseModel):
    file_name: str
    file_path: str
    download_url: str


class SettingsOut(BaseModel):
    openai_api_key_set: bool
    delete_audio_after_transcription: bool = False
    allow_lan_access: bool = True
    local_url: str
    network_url: str
    https_local_url: str | None = None
    https_network_url: str | None = None
    storage_path: str


class SettingsUpdate(BaseModel):
    openai_api_key: str | None = None
    delete_audio_after_transcription: bool | None = None
    allow_lan_access: bool | None = None
