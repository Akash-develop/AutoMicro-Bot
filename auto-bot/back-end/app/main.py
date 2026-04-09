"""
app/main.py
FastAPI application entry point.
"""
import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.routes import chat, settings, knowledge
from app.db.database import init_db

load_dotenv()

app = FastAPI(
    title="AutoMicro-Bot API",
    description="Backend for the Floating AI Chatbot Desktop App",
    version="0.1.0"
)

# ── CORS Configuration ─────────────────────────────────────
# Allows the Tauri frontend (usually localhost:5173 or tauri://localhost) 
# to communicate with this FastAPI server.
origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,tauri://localhost").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────
app.include_router(chat.router, tags=["chat"])
app.include_router(settings.router, prefix="/settings", tags=["settings"])
app.include_router(knowledge.router, prefix="/knowledge", tags=["knowledge"])

@app.on_event("startup")
async def startup_event():
    """Run initialization tasks on startup."""
    await init_db()

@app.get("/")
async def root():
    return {"message": "AutoMicro-Bot API is running", "status": "online"}

def start():
    """Entry point for `poetry run start` and the packaged Tauri sidecar.

    Env:
      HOST / PORT — Tauri sidecar uses 127.0.0.1:8765 (see src-tauri).
      UVICORN_RELOAD — default "1" for dev; sidecar should set "0".
    """
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("UVICORN_RELOAD", "1").strip().lower() in ("1", "true", "yes", "on")
    uvicorn.run("app.main:app", host=host, port=port, reload=reload)

if __name__ == "__main__":
    start()
