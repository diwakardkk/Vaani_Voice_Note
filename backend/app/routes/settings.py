from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import SettingsUpdate
from ..services.ip_service import network_info
from ..services.settings_service import api_key_is_set, get_bool, set_api_key, set_bool, storage_path

router = APIRouter(prefix="/api", tags=["settings"])


@router.get("/network-info")
def get_network_info():
    return network_info()


@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    info = network_info()
    return {
        "openai_api_key_set": api_key_is_set(db),
        "delete_audio_after_transcription": get_bool(db, "delete_audio_after_transcription", False),
        "allow_lan_access": get_bool(db, "allow_lan_access", True),
        "local_url": info["local_url"],
        "network_url": info["network_url"],
        "https_local_url": info["https_local_url"],
        "https_network_url": info["https_network_url"],
        "storage_path": storage_path(),
    }


@router.put("/settings")
def put_settings(payload: SettingsUpdate, db: Session = Depends(get_db)):
    if payload.openai_api_key:
        set_api_key(db, payload.openai_api_key)
    if payload.delete_audio_after_transcription is not None:
        set_bool(db, "delete_audio_after_transcription", payload.delete_audio_after_transcription)
    if payload.allow_lan_access is not None:
        set_bool(db, "allow_lan_access", payload.allow_lan_access)
    return get_settings(db)
