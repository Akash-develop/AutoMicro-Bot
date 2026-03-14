"""
app/db/database.py
Persistent SQLite storage for chat history using aiosqlite.
"""
import os
import aiosqlite
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

DB_PATH = os.getenv("DB_PATH", "./automicro.db")

async def init_db():
    """Initialize SQLite tables if they don't exist."""
    async with aiosqlite.connect(DB_PATH) as db:
        # Messages table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("CREATE INDEX IF NOT EXISTS idx_session ON messages(session_id)")

        # Conversations table — stores title per session
        await db.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                session_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.commit()


# ─── Conversations ────────────────────────────────────────────────────────────

async def create_conversation(session_id: str, title: str):
    """Create a new conversation record (called on first message)."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO conversations (session_id, title) VALUES (?, ?)",
            (session_id, title)
        )
        await db.commit()


async def rename_conversation(session_id: str, title: str):
    """Rename a conversation."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE conversations SET title = ? WHERE session_id = ?",
            (title, session_id)
        )
        await db.commit()


async def delete_conversation(session_id: str):
    """Delete a conversation and all its messages."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        await db.execute("DELETE FROM conversations WHERE session_id = ?", (session_id,))
        await db.commit()


async def get_all_conversations():
    """Retrieve all conversations with their latest message timestamp, ordered newest first."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT
                c.session_id,
                c.title,
                c.created_at,
                COALESCE(m.last_ts, c.created_at) AS last_active,
                COALESCE(m.last_message, '') AS last_message,
                COALESCE(m.last_role, '') AS role
            FROM conversations c
            LEFT JOIN (
                SELECT
                    session_id,
                    content AS last_message,
                    role AS last_role,
                    MAX(timestamp) AS last_ts
                FROM messages
                GROUP BY session_id
            ) m ON c.session_id = m.session_id
            ORDER BY last_active DESC
        """) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


# ─── Messages ─────────────────────────────────────────────────────────────────

async def save_message(session_id: str, role: str, content: str):
    """Save a single message to history."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
            (session_id, role, content)
        )
        await db.commit()


async def get_history(session_id: str, limit: int = 50):
    """Retrieve chat history for a session."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, session_id, role, content, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT ?",
            (session_id, limit)
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


async def clear_history(session_id: str):
    """Delete all messages for a session (keeps conversation record)."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        await db.commit()


async def get_all_sessions():
    """Legacy: Retrieve unique session IDs and their latest message details."""
    return await get_all_conversations()


async def is_first_message(session_id: str) -> bool:
    """Check if this session has no messages yet (i.e. first message)."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT COUNT(*) FROM messages WHERE session_id = ?", (session_id,)
        ) as cursor:
            row = await cursor.fetchone()
            return row[0] == 0
