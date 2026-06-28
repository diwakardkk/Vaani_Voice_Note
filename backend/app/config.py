from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
STORAGE_DIR = BASE_DIR / "storage"
AUDIO_DIR = STORAGE_DIR / "audio"
EXPORTS_DIR = STORAGE_DIR / "exports"
BACKUPS_DIR = STORAGE_DIR / "backups"
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

for directory in (DATA_DIR, AUDIO_DIR, EXPORTS_DIR, BACKUPS_DIR):
    directory.mkdir(parents=True, exist_ok=True)


class AppSettings(BaseSettings):
    app_name: str = "VaaniNotes AI"
    database_url: str = f"sqlite:///{DATA_DIR / 'vaaninotes.db'}"
    openai_api_key: str | None = None
    openai_transcription_model: str = "whisper-1"
    openai_chat_model: str = "gpt-4o-mini"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = AppSettings()
