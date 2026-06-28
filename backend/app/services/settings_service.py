import base64
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from ..config import DATA_DIR, STORAGE_DIR, settings
from ..models import Setting


KEY_PATH = DATA_DIR / "settings.key"


def _fernet() -> Fernet:
    if not KEY_PATH.exists():
        KEY_PATH.write_bytes(Fernet.generate_key())
    return Fernet(KEY_PATH.read_bytes())


def get_setting(db: Session, key: str, default: str | None = None) -> str | None:
    row = db.get(Setting, key)
    return row.value if row else default


def set_setting(db: Session, key: str, value: str) -> None:
    row = db.get(Setting, key)
    if row:
        row.value = value
    else:
        db.add(Setting(key=key, value=value))
    db.commit()


def get_bool(db: Session, key: str, default: bool) -> bool:
    value = get_setting(db, key)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def set_bool(db: Session, key: str, value: bool) -> None:
    set_setting(db, key, "true" if value else "false")


def set_api_key(db: Session, api_key: str) -> None:
    token = _fernet().encrypt(api_key.encode("utf-8")).decode("utf-8")
    set_setting(db, "openai_api_key_encrypted", token)


def get_api_key(db: Session) -> str | None:
    if settings.openai_api_key:
        return settings.openai_api_key
    encrypted = get_setting(db, "openai_api_key_encrypted")
    if not encrypted:
        return None
    try:
        return _fernet().decrypt(encrypted.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None


def api_key_is_set(db: Session) -> bool:
    return bool(get_api_key(db))


def storage_path() -> str:
    return str(STORAGE_DIR)
