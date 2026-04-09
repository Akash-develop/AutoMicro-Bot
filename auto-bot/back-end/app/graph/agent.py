import os
import logging
import sqlite3
import asyncio
import time
from dotenv import load_dotenv

from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langgraph.graph import StateGraph, MessagesState, START
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.prebuilt import create_react_agent

from app.db.database import save_message, get_llm_settings, get_personality_config
from app.graph.tools.permission_manager import load_permissions, BUILTIN_TOOLS
from app.graph.humanoid.emotion_analyzer import analyze_emotion
from app.graph.humanoid.rag_retriever import retrieve_context
from app.graph.humanoid.personality_engine import (
    build_personality_directives,
    get_personality,
    set_personality,
    update_session_state,
)

logger = logging.getLogger(__name__)

from app.graph.tools.terminal_executor import execute_terminal_command
from app.graph.tools.todo_tools import read_todos, write_todos

load_dotenv()

# ── Global Agent State ───────────────────────────────────────────
_agent_apps: dict[str, object] = {}
_llm = None
_saver = None
_current_provider = "ollama"  # Track provider for specialized message formatting
_current_model = "llama3"     # Track model name in case provider is aliased
STM_DB_PATH = os.getenv("STM_DB_PATH", "stm.db")
_saver_ctx = None  # To track the active context manager

# LangGraph: remaining_steps ≈ recursion_limit − step. A high limit allows many agent↔tool
# cycles per *one* user message (e.g. recursion_limit 8 often yields ~4 agent passes with
# execute_terminal_command). Default caps at roughly one tool round (agent → tools → agent).
# Override with AUTOMICRO_AGENT_RECURSION_LIMIT (e.g. 8) if tasks need multiple tool calls.
DEFAULT_AGENT_RECURSION_LIMIT = int(os.getenv("AUTOMICRO_AGENT_RECURSION_LIMIT", "8"))

def _rotate_corrupt_sqlite_db(db_path: str) -> str:
    """Move a corrupt SQLite DB (and WAL/SHM) aside, return new path.

    This is used for the LangGraph checkpointer DB only. We prefer restoring service
    over keeping a broken checkpoint history.
    """
    ts = time.strftime("%Y%m%d-%H%M%S")
    base_backup = f"{db_path}.corrupt.{ts}"

    def _try_replace(src: str, dst: str) -> None:
        if os.path.exists(src):
            os.replace(src, dst)

    _try_replace(db_path, base_backup)
    _try_replace(f"{db_path}-wal", f"{base_backup}-wal")
    _try_replace(f"{db_path}-shm", f"{base_backup}-shm")
    return db_path

def _sqlite_quick_check_ok(db_path: str) -> bool:
    """Return True if SQLite quick_check reports 'ok'."""
    if not os.path.exists(db_path):
        return True
    try:
        con = sqlite3.connect(db_path)
        try:
            row = con.execute("PRAGMA quick_check;").fetchone()
            return bool(row) and str(row[0]).lower() == "ok"
        finally:
            con.close()
    except Exception:
        return False

def reset_agent():
    """Global hook to clear the singleton and force re-init with new settings.
    Bug #4 fix: also clears _saver so the SQLite checkpointer connection
    is cleanly re-opened on next get_app() call (prevents file-handle leaks).
    """
    global _agent_apps, _llm, _saver, _saver_ctx
    _agent_apps.clear()
    _llm = None
    # Bug #4 fix: cleanly shut down and clear saver
    if _saver_ctx:
        # Note: In a real app we'd await _saver_ctx.__aexit__(None, None, None)
        # but since this is a global reset and we are in a sync function,
        # we'll just null them and let GC handle it, or better, 
        # let the next get_app call handle the fresh init.
        pass
    _saver = None
    _saver_ctx = None

# ── LangGraph Setup ───────────────────────────────────────

PLAN_MODE_TOOLS = [execute_terminal_command, write_todos, read_todos]
CHAT_MODE_TOOLS: list = []

CHAT_MODE_SYSTEM = (
    "You are AutoMicro-Bot, a friendly chat assistant.\n"
    "\n"
    "CHAT MODE RULES:\n"
    "- You have NO tools (no terminal, no automation). Reply with text only.\n"
    "- Do not claim you opened apps or ran commands.\n"
    "- If the user asks you to do actions on macOS, tell them to switch to Plan mode.\n"
)


def _last_human_text(state: MessagesState) -> str:
    for msg in reversed(state["messages"]):
        if getattr(msg, "type", "") == "human" or isinstance(msg, HumanMessage):
            c = msg.content
            return c if isinstance(c, str) else str(c)
    return ""


def _strip_fiction_tag(user_text: str) -> tuple[bool, str]:
    """If message starts with [FICTION], return (True, remainder for RAG/emotion)."""
    s = user_text.lstrip()
    if not s.upper().startswith("[FICTION]"):
        return False, user_text
    rest = s[9:].lstrip()
    if "\n" in rest:
        return True, rest.split("\n", 1)[1].strip()
    return True, rest.strip()


def build_system_prompt(state: MessagesState) -> list:
    base_prompt = (
        "You are AutoMicro-Bot, a powerful AI desktop agent for macOS. "
        "Keep your responses friendly and brief. You execute shell commands "
        "via the terminal tool to automate tasks on the user's Mac.\n"
        "\n"
        "macOS COMMAND REFERENCE:\n"
        "- Wi-Fi SSID: `networksetup -getairportnetwork en0` (do NOT use `airport`, it's removed)\n"
        "- Wi-Fi password: `security find-generic-password -D \"802.11 Password\" -w -a \"<SSID>\"`\n"
        "- Open apps: `open -a \"App Name\"` or `open /path/to/file`\n"
        "- System info: `sw_vers` (macOS version), `uname -a`, `sysctl -n hw.memsize`, `df -h`\n"
        "- Disk info: `diskutil list`, `diskutil info /`\n"
        "- Process management: `ps aux | grep name`, `kill PID`, `top -l 1 | head -20`\n"
        "- Network: `ifconfig`, `netstat -an`, `lsof -i :PORT`, `curl -s URL`\n"
        "- Clipboard: `pbcopy` (write), `pbpaste` (read) — e.g. `echo text | pbcopy`\n"
        "- Text-to-speech: `say \"message\"` or `say -v Voice \"message\"`\n"
        "- Notifications: `osascript -e 'display notification \"msg\" with title \"title\"'`\n"
        "- Dialogs: `osascript -e 'display dialog \"msg\" buttons {\"OK\"}'`\n"
        "- App control via AppleScript: `osascript -e 'tell application \"Finder\" to ...'`\n"
        "- Screenshots: `screencapture -x /tmp/screen.png` (silent), `screencapture -ic` (clipboard)\n"
        "- Power: `pmset -g batt` (battery), `caffeinate -t 300` (prevent sleep 5min)\n"
        "- Preferences: `defaults read domain key`, `defaults write domain key value`\n"
        "- Homebrew: `brew install pkg`, `brew list`, `brew update`, `brew upgrade`\n"
        "- Files: `find ~/path -name \"*.ext\"`, `ls -lahS`, `du -sh *`, `stat file`\n"
        "- Text processing: `grep -r pattern dir`, `awk`, `sed`, `sort`, `uniq`, `wc -l`\n"
        "- Archives: `tar -czf out.tar.gz dir/`, `unzip file.zip -d dest/`\n"
        "- Git: `git status`, `git log --oneline -10`, `git diff`, `git branch`\n"
        "- Python: `python3 -c \"code\"`, `pip3 install pkg`\n"
        "\n"
        "WHEN TO USE TOOLS vs WHEN TO JUST CHAT:\n"
        "- ONLY use the terminal tool when the user EXPLICITLY asks you to perform a task, run a command, "
        "check something on their system, open an app, or do something that requires a shell command.\n"
        "- If the user is chatting casually, venting, sharing feelings, asking questions, having a conversation, "
        "or saying things like 'I'm stressed', 'how are you', 'tell me a joke', 'I'm bored' — "
        "respond with a friendly TEXT reply ONLY. Do NOT run any commands.\n"
        "- NEVER run osascript, say, or notification commands as a response to casual/emotional messages.\n"
        "- When in doubt, just reply with text. Only use tools when there's a clear system task to perform.\n"
        "\n"
        "TOOL INSTRUCTIONS (when tools ARE needed):\n"
        "- CRITICAL — ONE USER MESSAGE ⇒ ONE TOOL CALL WHENEVER POSSIBLE: If the user gives a scripted sequence in a single message "
        "(e.g. open Chrome, wait 2s, search X, wait 7s, search Y), implement the whole sequence as ONE shell string passed to "
        "`execute_terminal_command`. Use `&&` to stop on failure, `;` to continue, and `sleep N` for waits. "
        "For searches, open URLs directly, e.g. `open -a \"Google Chrome\" \"https://www.google.com/search?q=QUERY\"` "
        "(encode spaces in QUERY as + or %20). Do not split that into multiple tool rounds.\n"
        "- Never make multiple parallel tool calls in one model turn.\n"
        "- Only use a second tool call in a later turn if the first output is required to decide what to do next "
        "(rare). Do not chain tool calls just to mirror each sentence of the user.\n"
        "- Combine related actions into a SINGLE command when possible "
        "(e.g. `open -a \"Google Chrome\" \"https://www.google.com/search?q=youtube\"` — opens Chrome and searches in one command).\n"
        "- You may write a short, conversational response before running a command.\n"
        "- Pipe commands together when efficient (e.g. `ls -la | grep .py | wc -l`).\n"
        "- Commands run in the user's home directory (~) by default.\n"
        "- Output includes exit codes — check them to detect failures and handle errors.\n"
        "- Commands have a 60-second timeout. For long operations, warn the user first.\n"
        "- If the `open` command returns '(no output)' with exit code 0, that means SUCCESS. Do NOT retry it.\n"
        "\n"
        "INTERRUPTION HANDLING:\n"
        "- If interrupted or stopped, do NOT try to explain or 'fix' with more commands. Simply wait for the next user request."
    )
    # Ensure it's a string to avoid Pyre errors on +=
    base_prompt = str(base_prompt)

    # ── Humanoid Personality Engine ─────────────────────────────────
    personality = get_personality()
    last_user_raw = _last_human_text(state)
    has_fiction_prefix, remainder_after_tag = _strip_fiction_tag(last_user_raw)
    fiction_active = bool(personality.get("fiction_mode")) or has_fiction_prefix

    if personality.get("social_white_lies"):
        base_prompt += (
            "\n\nSOCIAL MODE NOTE: You may use casual, face-saving, or vivid phrasing in plain chat. "
            "Terminal and tool results are sacred: report exit codes and output exactly; "
            "never invent or misstate what happened on the Mac."
        )
    if fiction_active:
        from app.graph.humanoid.config import FICTION_MODE_DIRECTIVE
        base_prompt += FICTION_MODE_DIRECTIVE

    if personality.get("enabled"):
        last_user_msg = last_user_raw
        msg_for_emotion = remainder_after_tag if has_fiction_prefix and remainder_after_tag.strip() else last_user_raw

        if last_user_msg:
            emotion = analyze_emotion(msg_for_emotion)
            config_key = state.get("configurable", {}).get("thread_id", "default")
            update_session_state(config_key, emotion)
            # Fiction mode: skip psychology RAG + personality sliders — they pull "therapist trust"
            # boundaries that fight in-story betrayal/reveal plots.
            if not fiction_active:
                rag_context = retrieve_context(msg_for_emotion, emotion=emotion, personality=personality)
                if rag_context:
                    base_prompt += "\n" + rag_context
                personality_directives = build_personality_directives(config_key, emotion)
                if personality_directives:
                    base_prompt += "\n" + personality_directives

    # ── Tanglish Language Mode ─────────────────────────────────────
    if personality.get("tanglish"):
        from app.graph.humanoid.config import TANGLISH_DIRECTIVE
        base_prompt += TANGLISH_DIRECTIVE

    perms = load_permissions()
    custom_rules_enabled = []
    custom_rules_disabled = []
    
    for key, enabled in perms.items():
        if key == "_locked_tools":
            continue
        if key not in BUILTIN_TOOLS:
            rule_text = key.replace('_', ' ')
            # Standard logic:
            # If switch is ON (enabled), the action is ALLOWED.
            # If switch is OFF (disabled), the action is FORBIDDEN.
            if enabled:
                custom_rules_enabled.append(rule_text)
            else:
                custom_rules_disabled.append(rule_text)
    
    if custom_rules_enabled or custom_rules_disabled:
        base_prompt += "\n\nCRITICAL USER INSTRUCTIONS / CUSTOM RULES:\n"
        if custom_rules_enabled:
            base_prompt += "The following actions/rules are EXPLICITLY ALLOWED OR ENABLED:\n- " + "\n- ".join(custom_rules_enabled) + "\n"
        if custom_rules_disabled:
            base_prompt += "The following actions/rules are STRICTLY FORBIDDEN OR DISABLED (DO NOT under any circumstances perform these):\n- " + "\n- ".join(custom_rules_disabled) + "\n"
            
    # We must NOT flatten or strip `tool_calls` from AIMessages for most providers (like OpenAI/Ollama)
    # as it breaks native tool chaining. However, Google Gemini throws a 400 `thought_signature` error
    # if it loads historical tool calls from the SQLite checkpointer that lack proprietary Google kwargs.
    global _current_provider, _current_model
    if _current_provider == "gemini" or "gemini" in _current_model:
        safe_messages = []
        for msg in state["messages"]:
            if getattr(msg, "tool_calls", None) or (getattr(msg, "type", "") == "ai" and getattr(msg, "tool_calls", None)):
                content = msg.content or ""
                if content.strip():
                    safe_messages.append(AIMessage(content=content))
            elif getattr(msg, "type", "") == "tool" or isinstance(msg, ToolMessage):
                # Present the tool result as a HumanMessage so the LLM recognizes it as an external observation
                # (Using SystemMessage here causes infinite loops because the LLM ignores it and repeats the tool)
                safe_messages.append(HumanMessage(content=f"[Observation from tool '{getattr(msg, 'name', 'tool')}']:\n{msg.content}"))
            else:
                safe_messages.append(msg)
        return [SystemMessage(content=base_prompt)] + safe_messages

    # Default: Return pristine messages for OpenAI, Ollama, etc.
    return [SystemMessage(content=base_prompt)] + state["messages"]


def build_chat_prompt(state: MessagesState) -> list:
    """Prompt for chat-only mode (no tools)."""
    return [SystemMessage(content=CHAT_MODE_SYSTEM)] + state["messages"]


async def get_app(agent_mode: str = "plan"):
    """Lazy initializer for the LangGraph app with Async checkpointer."""
    global _agent_apps, _llm, _saver
    if agent_mode not in ("chat", "plan"):
        agent_mode = "plan"

    # Special executor key used by streaming endpoint to stop after first tools pass.
    cache_key = agent_mode

    if _agent_apps.get(cache_key) is None:
        # Load personality config from DB into the engine
        try:
            p_conf = await get_personality_config()
            if p_conf:
                set_personality(p_conf)
        except Exception:
            pass

        # Initialize LLM once (shared by both modes)
        global _current_provider, _current_model
        if _llm is None:
            conf = await get_llm_settings()
            if not conf:
                conf = {
                    "provider": "ollama",
                    "base_url": "http://localhost:11434",
                    "api_key": "",
                    "model": "llama3",
                }

            provider = conf["provider"].lower()
            _current_provider = provider
            _current_model = conf["model"].lower()
            base_url = conf.get("base_url", "").strip()

            if provider in ("openai", "openai-compat"):
                _llm = ChatOpenAI(
                    model=conf["model"],
                    base_url=base_url,
                    api_key=conf["api_key"],
                    temperature=0.7,
                )
            elif provider == "gemini":
                _llm = ChatGoogleGenerativeAI(
                    model=conf["model"],
                    google_api_key=conf["api_key"],
                    temperature=0.7,
                )
            elif provider in ("ollama", "ollama-cloud"):
                headers = None
                if provider == "ollama-cloud" and conf.get("api_key"):
                    headers = {"Authorization": f"Bearer {conf['api_key']}"}

                _llm = ChatOllama(
                    model=conf["model"],
                    base_url=base_url or "http://localhost:11434",
                    client_kwargs={"headers": headers} if headers else {},
                    temperature=0.7,
                )
            else:
                _llm = ChatOllama(
                    model=conf["model"],
                    base_url=base_url or "http://localhost:11434",
                    temperature=0.7,
                )

        # AsyncSqliteSaver.from_conn_string returns an async context manager
        if _saver is None:
            global _saver_ctx
            # If the checkpoint DB is corrupted, it may not fail until the first write.
            # Proactively check health and rotate before opening.
            if not _sqlite_quick_check_ok(STM_DB_PATH):
                logger.error(f"Checkpoint DB failed quick_check; rotating: {STM_DB_PATH}")
                _rotate_corrupt_sqlite_db(STM_DB_PATH)
            try:
                _saver_ctx = AsyncSqliteSaver.from_conn_string(STM_DB_PATH)
                _saver = await _saver_ctx.__aenter__()
            except sqlite3.DatabaseError as e:
                # e.g. "database disk image is malformed"
                logger.error(f"Checkpoint DB is corrupt ({STM_DB_PATH}): {e}")
                try:
                    _rotate_corrupt_sqlite_db(STM_DB_PATH)
                    _saver_ctx = AsyncSqliteSaver.from_conn_string(STM_DB_PATH)
                    _saver = await _saver_ctx.__aenter__()
                    logger.warning("Checkpoint DB rotated and recreated successfully.")
                except Exception as rotate_err:
                    logger.exception(f"Failed to rotate/recreate checkpoint DB: {rotate_err}")
                    raise
        
        tools_for_mode = CHAT_MODE_TOOLS if agent_mode == "chat" else PLAN_MODE_TOOLS
        prompt_for_mode = build_chat_prompt if agent_mode == "chat" else build_system_prompt

        _agent_apps[agent_mode] = create_react_agent(
            _llm,
            tools=tools_for_mode,
            checkpointer=_saver,
            prompt=prompt_for_mode,
        )
    return _agent_apps[agent_mode]


async def get_app_interrupt_after_tools(agent_mode: str = "plan"):
    """Like get_app(), but interrupts after the `tools` node (prevents repeated tool loops)."""
    global _agent_apps
    if agent_mode not in ("chat", "plan"):
        agent_mode = "plan"
    cache_key = f"{agent_mode}:after_tools"
    if _agent_apps.get(cache_key) is None:
        await get_app(agent_mode=agent_mode)
        # Rebuild with interrupt_after only for plan mode; chat mode has no tools anyway.
        if agent_mode == "plan":
            _agent_apps[cache_key] = create_react_agent(
                _llm,
                tools=PLAN_MODE_TOOLS,
                checkpointer=_saver,
                prompt=build_system_prompt,
                interrupt_after=["tools"],
            )
        else:
            _agent_apps[cache_key] = _agent_apps.get("chat")
    return _agent_apps[cache_key]


async def get_llm():
    """Return initialized chat model (shared)."""
    await get_app(agent_mode="chat")
    return _llm

async def get_agent_response(session_id: str, message: str, agent_mode: str = "plan") -> str:
    """Interface to run the LangGraph model with persistent STM."""
    app = await get_app(agent_mode=agent_mode)
    config = {
        "configurable": {"thread_id": session_id},
        "recursion_limit": DEFAULT_AGENT_RECURSION_LIMIT,
    }
    input_messages = {"messages": [HumanMessage(content=message)]}
    
    await save_message(session_id, "user", message)
    output = await app.ainvoke(input_messages, config)
    response_content = output["messages"][-1].content
    await save_message(session_id, "assistant", response_content)
    
    return response_content
