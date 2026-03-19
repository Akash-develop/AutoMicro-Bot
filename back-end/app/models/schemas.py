"""
app/models/schemas.py
Pydantic v2 request/response models
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class ChatRequest(BaseModel):
    session_id: str = Field(..., min_length=1, description="Unique session identifier")
    message: str = Field(..., min_length=1, description="User message text")


class ChatResponse(BaseModel):
    response: str
    session_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class MessageRecord(BaseModel):
    id: int
    session_id: str
    role: str  # "user" | "assistant"
    content: str
    timestamp: datetime


class HistoryResponse(BaseModel):
    session_id: str
    messages: list[MessageRecord]
    count: int


class DeleteResponse(BaseModel):
    session_id: str
    deleted: int
    message: str


class SessionSummary(BaseModel):
    session_id: str
    title: str
    created_at: datetime
    last_active: datetime
    last_message: str
    role: str


class RenameRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200, description="New conversation title")


class Attachment(BaseModel):
    name: str
    content: str
    mime_type: Optional[str] = "text/plain"
    size: Optional[int] = 0


class WSMessage(BaseModel):
    """WebSocket inbound message from client"""
    message: str
    attachment: Optional[Attachment] = None


class WSToken(BaseModel):
    """WebSocket outbound streaming token"""
    type: str  # "token" | "done" | "error"
    content: Optional[str] = None


class LLMSettings(BaseModel):
    provider: str
    base_url: str
    api_key: Optional[str] = ""
    model: str
