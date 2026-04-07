"""
app/db/database.py
Persistent SQLite storage for chat history using aiosqlite.
"""
import os
import aiosqlite
from datetime import datetime
from typing import Optional
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
                attachment TEXT, -- JSON string for multi-modal content
                plan_meta TEXT,  -- JSON string for Plan Mode task tracking
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("CREATE INDEX IF NOT EXISTS idx_session ON messages(session_id)")
        # Bug #7 fix: compound index for fast history queries by session ordered by time
        await db.execute("CREATE INDEX IF NOT EXISTS idx_messages_sess_ts ON messages(session_id, timestamp)")

        # ── Bug #1 Fix: conversations table was missing entirely ────────────
        await db.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                session_id TEXT PRIMARY KEY,
                title      TEXT NOT NULL DEFAULT 'New Conversation',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # LLM Settings table (Current Active Configuration)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS llm_settings (
                id INTEGER PRIMARY KEY DEFAULT 1,
                provider TEXT NOT NULL,
                base_url TEXT NOT NULL,
                api_key TEXT,
                model TEXT NOT NULL,
                history_id INTEGER -- Optional link to history
            )
        """)
        
        # TABLE MIGRATION: Add history_id if missing from existing table
        try:
            async with db.execute("PRAGMA table_info(llm_settings)") as cursor:
                columns = [row[1] for row in await cursor.fetchall()]
                if "history_id" not in columns:
                    await db.execute("ALTER TABLE llm_settings ADD COLUMN history_id INTEGER")
            
            async with db.execute("PRAGMA table_info(messages)") as cursor:
                columns = [row[1] for row in await cursor.fetchall()]
                if "attachment" not in columns:
                    await db.execute("ALTER TABLE messages ADD COLUMN attachment TEXT")
                if "plan_meta" not in columns:
                    await db.execute("ALTER TABLE messages ADD COLUMN plan_meta TEXT")
                    await db.execute("ALTER TABLE messages ADD COLUMN attachment TEXT")
                if "plan_meta" not in columns:
                    await db.execute("ALTER TABLE messages ADD COLUMN plan_meta TEXT")
        except Exception as e:
            print(f"Migration error: {e}")

        # LLM Settings History table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS llm_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL,
                base_url TEXT NOT NULL,
                api_key TEXT,
                model TEXT NOT NULL,
                is_active BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Check if settings exist, if not seed from env
        async with db.execute("SELECT COUNT(*) FROM llm_settings") as cursor:
            row = await cursor.fetchone()
            if row[0] == 0:
                provider = os.getenv("LLM_PROVIDER", "ollama")
                base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
                api_key = os.getenv("OLLAMA_API_KEY", "")
                model = os.getenv("OLLAMA_MODEL", "llama3")
                
                # Insert into history first
                cursor = await db.execute(
                    "INSERT INTO llm_history (provider, base_url, api_key, model, is_active) VALUES (?, ?, ?, ?, 1)",
                    (provider, base_url, api_key, model)
                )
                history_id = cursor.lastrowid
                
                # Insert into current settings
                await db.execute(
                    "INSERT INTO llm_settings (provider, base_url, api_key, model, history_id) VALUES (?, ?, ?, ?, ?)",
                    (provider, base_url, api_key, model, history_id)
                )
        
        # ── Humanoid Agent tables ────────────────────────────────────────────
        await db.execute("""
            CREATE TABLE IF NOT EXISTS pdf_sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL UNIQUE,
                file_hash TEXT DEFAULT '',
                chunk_count INTEGER DEFAULT 0,
                total_pages INTEGER DEFAULT 0,
                status TEXT DEFAULT 'processing',
                file_size INTEGER DEFAULT 0,
                error_message TEXT,
                ingested_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS personality_config (
                id INTEGER PRIMARY KEY DEFAULT 1,
                warmth REAL DEFAULT 0.8,
                humor REAL DEFAULT 0.6,
                empathy REAL DEFAULT 0.9,
                directness REAL DEFAULT 0.5,
                curiosity REAL DEFAULT 0.7,
                formality REAL DEFAULT 0.3,
                verbosity REAL DEFAULT 0.5,
                enabled INTEGER DEFAULT 1,
                tanglish INTEGER DEFAULT 0,
                social_white_lies INTEGER DEFAULT 0,
                fiction_mode INTEGER DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        try:
            async with db.execute("PRAGMA table_info(personality_config)") as cursor:
                pc_columns = [row[1] for row in await cursor.fetchall()]
                if "tanglish" not in pc_columns:
                    await db.execute(
                        "ALTER TABLE personality_config ADD COLUMN tanglish INTEGER DEFAULT 0"
                    )
                if "social_white_lies" not in pc_columns:
                    await db.execute(
                        "ALTER TABLE personality_config ADD COLUMN social_white_lies INTEGER DEFAULT 0"
                    )
                if "fiction_mode" not in pc_columns:
                    await db.execute(
                        "ALTER TABLE personality_config ADD COLUMN fiction_mode INTEGER DEFAULT 0"
                    )
        except Exception as e:
            print(f"personality_config migration error: {e}")

        # Seed personality config if empty
        async with db.execute("SELECT COUNT(*) FROM personality_config") as cursor:
            row = await cursor.fetchone()
            if row[0] == 0:
                await db.execute(
                    "INSERT INTO personality_config (id) VALUES (1)"
                )

        # New Migration: If llm_history is empty but llm_settings exists, seed history
        async with db.execute("SELECT COUNT(*) FROM llm_history") as cursor:
            h_row = await cursor.fetchone()
            if h_row[0] == 0:
                async with db.execute("SELECT provider, base_url, api_key, model FROM llm_settings WHERE id = 1") as s_cursor:
                    s_row = await s_cursor.fetchone()
                    if s_row:
                        provider, base_url, api_key, model = s_row
                        cursor = await db.execute(
                            "INSERT INTO llm_history (provider, base_url, api_key, model, is_active) VALUES (?, ?, ?, ?, 1)",
                            (provider, base_url, api_key, model)
                        )
                        history_id = cursor.lastrowid
                        await db.execute("UPDATE llm_settings SET history_id = ? WHERE id = 1", (history_id,))
        
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

async def save_message(session_id: str, role: str, content: str, attachment: Optional[dict] = None, plan_meta: Optional[dict] = None):
    """Save a single message to history with optional attachment."""
    import json
    attachment_json = json.dumps(attachment) if attachment else None
    plan_meta_json = json.dumps(plan_meta) if plan_meta else None
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO messages (session_id, role, content, attachment, plan_meta) VALUES (?, ?, ?, ?, ?)",
            (session_id, role, content, attachment_json, plan_meta_json)
        )
        await db.commit()


async def get_history(session_id: str, limit: int = 50):
    """Retrieve chat history for a session."""
    import json
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, role, content, attachment, plan_meta, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT ?",
            (session_id, limit)
        ) as cursor:
            rows = await cursor.fetchall()
            history = []
            for row in rows:
                item = dict(row)
                if item.get("attachment"):
                    try:
                        item["attachment"] = json.loads(item["attachment"])
                    except Exception:
                        item["attachment"] = None
                else:
                    item["attachment"] = None
                if item.get("plan_meta"):
                    try:
                        item["plan_meta"] = json.loads(item["plan_meta"])
                    except Exception:
                        item["plan_meta"] = None
                else:
                    item["plan_meta"] = None
                # Required by API response model (MessageRecord.session_id)
                item["session_id"] = session_id
                history.append(item)
            return history


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

# ─── LLM Settings ─────────────────────────────────────────────────────────────

async def get_llm_settings():
    """Retrieve current LLM configuration."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT provider, base_url, api_key, model, history_id FROM llm_settings WHERE id = 1") as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

async def update_llm_settings(settings: dict, db=None):
    """Update global LLM configuration and sync with history."""
    if db:
        await _perform_llm_update(db, settings)
    else:
        async with aiosqlite.connect(DB_PATH, timeout=10) as new_db:
            await _perform_llm_update(new_db, settings)
            await new_db.commit()

async def _perform_llm_update(db, settings: dict):
    """Internal helper to execute the update query."""
    await db.execute("""
        UPDATE llm_settings 
        SET provider = ?, base_url = ?, api_key = ?, model = ?, history_id = ?
        WHERE id = 1
    """, (
        settings['provider'],
        settings['base_url'],
        settings['api_key'],
        settings['model'],
        settings.get('history_id')
    ))

async def get_llm_history():
    """Retrieve all saved LLM configurations."""
    async with aiosqlite.connect(DB_PATH, timeout=10) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT id, provider, base_url, api_key, model, is_active, created_at FROM llm_history ORDER BY created_at DESC") as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

async def save_llm_history(settings: dict):
    """Save a new LLM configuration to history and set it as active."""
    async with aiosqlite.connect(DB_PATH, timeout=10) as db:
        # Deactivate previous active
        await db.execute("UPDATE llm_history SET is_active = 0")
        
        # Insert new active
        cursor = await db.execute("""
            INSERT INTO llm_history (provider, base_url, api_key, model, is_active)
            VALUES (?, ?, ?, ?, 1)
        """, (
            settings['provider'],
            settings['base_url'],
            settings['api_key'],
            settings['model']
        ))
        row_id = cursor.lastrowid
        
        # Update current settings using the same connection
        settings_with_id = settings.copy()
        settings_with_id['history_id'] = row_id
        await update_llm_settings(settings_with_id, db=db)
        await db.commit()
        return row_id

async def delete_llm_history(history_id: int):
    """Delete a configuration from history and clear its active link if necessary."""
    async with aiosqlite.connect(DB_PATH, timeout=10) as db:
        # If this was the active one, clear the history_id reference in llm_settings
        await db.execute("UPDATE llm_settings SET history_id = NULL WHERE history_id = ?", (history_id,))
        await db.execute("DELETE FROM llm_history WHERE id = ?", (history_id,))
        await db.commit()

async def activate_llm_config(history_id: int):
    """Activate a configuration from history."""
    async with aiosqlite.connect(DB_PATH, timeout=10) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT provider, base_url, api_key, model FROM llm_history WHERE id = ?", (history_id,)) as cursor:
            row = await cursor.fetchone()
            if row:
                config = dict(row)
                config['history_id'] = history_id
                
                # Update history activation status
                await db.execute("UPDATE llm_history SET is_active = 0")
                await db.execute("UPDATE llm_history SET is_active = 1 WHERE id = ?", (history_id,))
                
                # Sync current settings using the SAME connection
                await update_llm_settings(config, db=db)
                await db.commit()
                return True
    return False


# ─── PDF Sources (Humanoid Agent) ────────────────────────────────────────────

async def save_pdf_source(filename: str, status: str = "processing",
                          file_size: int = 0, chunk_count: int = 0,
                          total_pages: int = 0, file_hash: str = ""):
    """Insert or update a PDF source record."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO pdf_sources (filename, file_hash, chunk_count, total_pages, status, file_size)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(filename) DO UPDATE SET
                file_hash = excluded.file_hash,
                chunk_count = excluded.chunk_count,
                total_pages = excluded.total_pages,
                status = excluded.status,
                file_size = excluded.file_size,
                ingested_at = CURRENT_TIMESTAMP
        """, (filename, file_hash, chunk_count, total_pages, status, file_size))
        await db.commit()


async def update_pdf_source_status(filename: str, status: str,
                                    chunk_count: int = 0, total_pages: int = 0,
                                    file_hash: str = "", error_message: str = ""):
    """Update the status of a PDF source."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            UPDATE pdf_sources SET status = ?, chunk_count = ?,
            total_pages = ?, file_hash = ?, error_message = ?
            WHERE filename = ?
        """, (status, chunk_count, total_pages, file_hash, error_message, filename))
        await db.commit()


async def get_pdf_sources():
    """Get all PDF source records."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM pdf_sources ORDER BY ingested_at DESC"
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


async def delete_pdf_source(source_name: str):
    """Delete a PDF source record by source name (filename without .pdf)."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "DELETE FROM pdf_sources WHERE filename LIKE ?",
            (f"{source_name}%",)
        )
        await db.commit()


# ─── Personality Config (Humanoid Agent) ──────────────────────────────────────

async def get_personality_config():
    """Get the current personality configuration."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM personality_config WHERE id = 1") as cursor:
            row = await cursor.fetchone()
            if row:
                return dict(row)
            return None


async def update_personality_config(config: dict):
    """Update personality configuration."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            UPDATE personality_config SET
                warmth = ?, humor = ?, empathy = ?, directness = ?,
                curiosity = ?, formality = ?, verbosity = ?,
                enabled = ?, tanglish = ?, social_white_lies = ?,
                fiction_mode = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        """, (
            config.get("warmth", 0.8),
            config.get("humor", 0.6),
            config.get("empathy", 0.9),
            config.get("directness", 0.5),
            config.get("curiosity", 0.7),
            config.get("formality", 0.3),
            config.get("verbosity", 0.5),
            1 if config.get("enabled", True) else 0,
            1 if config.get("tanglish", False) else 0,
            1 if config.get("social_white_lies", False) else 0,
            1 if config.get("fiction_mode", False) else 0,
        ))
        await db.commit()
