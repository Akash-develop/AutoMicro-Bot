import os
import sqlite3
import asyncio
from dotenv import load_dotenv

from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langgraph.graph import StateGraph, MessagesState, START
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.prebuilt import create_react_agent

from app.db.database import save_message, get_llm_settings
from app.graph.tools.permission_manager import load_permissions, BUILTIN_TOOLS

# Tools
from app.graph.tools.terminal_executor import execute_terminal_command
from app.graph.tools.browser_actions import open_url, search_web
from app.graph.tools.system_actions import sleep_system
from app.graph.tools.file_actions import create_folder, create_file
from app.graph.tools.excel_actions import create_excel_with_sample_data
from app.graph.tools.memory_actions import save_long_term_memory
from app.db.chroma import search_memory

load_dotenv()

# ── Global Agent State ───────────────────────────────────────────
_agent_app = None
_saver = None
_current_provider = "ollama"  # Track provider for specialized message formatting
_current_model = "llama3"     # Track model name in case provider is aliased
STM_DB_PATH = os.getenv("STM_DB_PATH", "stm.db")
_checkpointer_ctx = AsyncSqliteSaver.from_conn_string(STM_DB_PATH)

def reset_agent():
    """Global hook to clear the singleton and force re-init with new settings.
    Bug #4 fix: also clears _saver so the SQLite checkpointer connection
    is cleanly re-opened on next get_app() call (prevents file-handle leaks).
    """
    global _agent_app, _saver
    _agent_app = None
    _saver = None

# ── LangGraph Setup ───────────────────────────────────────

tools = [
    execute_terminal_command,
    open_url,
    search_web,
    sleep_system,
    create_folder,
    create_file,
    create_excel_with_sample_data,
    save_long_term_memory
]

def build_system_prompt(state: MessagesState) -> list:
    base_prompt = (
        "You are AutoMicro-Bot, a helpful, concise AI assistant floating on the user's desktop. "
        "Keep your responses friendly and brief. You have access to various tools to control the OS and browser. "
        "Use them when requested.\n"
        "IMPORTANT macOS INSTRUCTIONS:\n"
        "- Do NOT use the `airport` command for Wi-Fi, it is removed in modern macOS.\n"
        "- To get the current Wi-Fi SSID, use: `networksetup -getairportnetwork en0`\n"
        "- To get the Wi-Fi password for an SSID, use: `security find-generic-password -D \"802.11 Password\" -w -a \"<SSID_NAME>\"`\n"
        "CRITICAL TOOL INSTRUCTION:\n"
        "- You may write a short, conversational response before using a tool IF it helps the user understand what you are doing, but it is NOT mandatory if the task is obvious.\n"
        "- If the user asks for multiple actions (e.g., 'create a folder and a file inside it'), you MUST execute the first tool, wait for the result, and then execute the second tool in the same response chain until all tasks are complete.\n"
        "INTERRUPTION HANDLING:\n"
        "- If you are interrupted or the user stops you, do NOT try to explain or 'fix' the situation with more tools or long messages. Simply wait for the next user request."
    )
    
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
            
    latest_user_msg = ""
    for msg in reversed(state["messages"]):
        if getattr(msg, "type", "") == "human" or isinstance(msg, HumanMessage):
            latest_user_msg = msg.content
            break
            
    if latest_user_msg:
        try:
            relevant_memories = search_memory(latest_user_msg, n_results=3)
            if relevant_memories:
                base_prompt += "\n\nRELEVANT LONG-TERM MEMORIES (Context for this conversation):\n"
        except Exception as e:
            pass

    # We must NOT flatten or strip `tool_calls` from AIMessages for most providers (like OpenAI/Ollama)
    # as it breaks native tool chaining. However, Google Gemini throws a 400 `thought_signature` error
    # if it loads historical tool calls from the SQLite checkpointer that lack proprietary Google kwargs.
    global _current_provider, _current_model
    if _current_provider == "gemini" or "gemini" in _current_model:
        safe_messages = []
        for msg in state["messages"]:
            if getattr(msg, "tool_calls", None) or (getattr(msg, "type", "") == "ai" and getattr(msg, "tool_calls", None)):
                # Strip native tool_calls to bypass Gemini 400 error
                tool_names = ", ".join([tc.get("name", "tool") for tc in getattr(msg, "tool_calls", [])])
                content = msg.content or f"I decided to execute tools: {tool_names}."
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

async def get_app():
    """Lazy initializer for the LangGraph app with Async checkpointer."""
    global _agent_app, _saver
    if _agent_app is None:
        # Fetch dynamic settings from DB
        conf = await get_llm_settings()
        if not conf:
            # Fallback if DB not ready (unlikely after init_db)
            conf = {
                "provider": "ollama",
                "base_url": "http://localhost:11434",
                "api_key": "",
                "model": "llama3"
            }

        # Initialize LLM based on settings
        provider = conf['provider'].lower()
        global _current_provider, _current_model
        _current_provider = provider
        _current_model = conf['model'].lower()
        
        if provider in ("openai", "openai-compat"):
            llm = ChatOpenAI(
                model=conf['model'],
                openai_api_base=conf['base_url'],
                openai_api_key=conf['api_key'],
                temperature=0.7
            )
        elif provider == "gemini":
            llm = ChatGoogleGenerativeAI(
                model=conf['model'],
                google_api_key=conf['api_key'],
                temperature=0.7
            )
        else:
            llm = ChatOllama(
                model=conf['model'],
                base_url=conf['base_url'],
                temperature=0.7
            )

        # AsyncSqliteSaver.from_conn_string returns an async context manager
        if _saver is None:
            _saver = await _checkpointer_ctx.__aenter__()
        
        _agent_app = create_react_agent(llm, tools=tools, checkpointer=_saver, state_modifier=build_system_prompt)
    return _agent_app

async def get_agent_response(session_id: str, message: str) -> str:
    """Interface to run the LangGraph model with persistent STM."""
    app = await get_app()
    config = {"configurable": {"thread_id": session_id}}
    input_messages = {"messages": [HumanMessage(content=message)]}
    
    await save_message(session_id, "user", message)
    output = await app.ainvoke(input_messages, config)
    response_content = output["messages"][-1].content
    await save_message(session_id, "assistant", response_content)
    
    return response_content
