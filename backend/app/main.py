from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import FRONTEND_DIST, settings
from .database import init_db
from .routes import ai, audio, commands, export, notes, settings as settings_routes
from .services.ip_service import network_info


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    info = network_info()
    print(f"\nVaaniNotes AI running\nLocal: {info['local_url']}\nNetwork: {info['network_url']}\n")
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins + ["http://0.0.0.0:5173"],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+):5173",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(notes.router)
app.include_router(audio.router)
app.include_router(ai.router)
app.include_router(commands.router)
app.include_router(settings_routes.router)
app.include_router(export.router)


@app.get("/api/health")
def health():
    return {"ok": True, "app": settings.app_name}


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
