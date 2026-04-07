from fastapi import APIRouter
from typing import Optional
from app.graph.tools.permission_manager import load_permissions, save_permissions
from app.db.database import (
    get_llm_settings, update_llm_settings,
    get_llm_history, save_llm_history, delete_llm_history, activate_llm_config,
    get_personality_config, update_personality_config,
)
from app.models.schemas import LLMSettings, ChatRequest
from pydantic import BaseModel
import httpx
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class PermissionsUpdate(BaseModel):
    permissions: dict[str, bool]
    locked_tools: list[str] = []

@router.get("/permissions")
async def get_permissions():
    """Returns the current tool permissions configuration."""
    perms = load_permissions()
    # The JSON includes the permissions. The locks are also in there.
    # To keep the API clean, we return the whole dict.
    return perms

@router.post("/permissions")
async def update_permissions(update: PermissionsUpdate):
    """Updates the tool permissions configuration."""
    # We store the locked_tools array alongside the permissions dictionary
    data = update.permissions.copy()
    data["_locked_tools"] = update.locked_tools
    save_permissions(data)
    return {"status": "success", "permissions": update.permissions, "locked_tools": update.locked_tools}

@router.delete("/permissions/{tool_name}")
async def delete_permission(tool_name: str):
    """Deletes a tool permission from the configuration."""
    perms = load_permissions()
    if tool_name in perms:
        del perms[tool_name]
        save_permissions(perms)
        return {"status": "success", "deleted": tool_name}
    return {"status": "error", "message": "Tool not found"}

# ─── LLM Settings ─────────────────────────────────────────────────────────────

@router.get("/llm", response_model=LLMSettings)
async def get_llm_settings_endpoint():
    """Returns the current LLM configuration."""
    settings = await get_llm_settings()
    return settings

@router.post("/llm")
async def update_llm_settings_endpoint(settings: LLMSettings):
    """Updates the global LLM configuration and saves to history."""
    await save_llm_history(settings.model_dump())
    
    # Force agent re-initialization on next call
    from app.graph.agent import reset_agent
    reset_agent()
    
    return {"status": "success"}

@router.get("/llm/history")
async def get_llm_history_endpoint():
    """Returns the LLM configuration history."""
    return await get_llm_history()

@router.post("/llm/history/{history_id}/activate")
async def activate_llm_config_endpoint(history_id: int):
    """Activates a specific LLM configuration from history."""
    success = await activate_llm_config(history_id)
    if success:
        from app.graph.agent import reset_agent
        reset_agent()
        return {"status": "success"}
    return {"status": "error", "message": "Failed to activate configuration"}

@router.delete("/llm/history/{history_id}")
async def delete_llm_history_endpoint(history_id: int):
    """Deletes a specific LLM configuration from history."""
    print(f"DEBUG: DELETE REQUEST RECEIVED FOR HISTORY ID: {history_id}")
    await delete_llm_history(history_id)
    return {"status": "success"}

@router.get("/llm/models")
async def get_available_models_endpoint(provider: str, base_url: str, api_key: Optional[str] = None):
    """Fetch available models from Ollama or OpenAI-compatible providers."""
    # ensure base_url is correct
    if not base_url:
        if provider in ("ollama", "ollama-cloud"):
            base_url = "http://localhost:11434"
        elif provider == "openai-compat":
            return {"models": []} # Need a URL for compat
        else:
            return {"models": []}
    
    # remove trailing slash
    base_url = base_url.rstrip("/")
    
    try:
        async with httpx.AsyncClient() as client:
            headers = {}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            
            # Use /api/tags for Ollama and Ollama-Cloud (and as a default for custom URLs)
            if provider in ("ollama", "ollama-cloud"):
                resp = await client.get(f"{base_url}/api/tags", headers=headers, timeout=5.0)
                if resp.status_code == 200:
                    data = resp.json()
                    models = [m["name"] for m in data.get("models", [])]
                    return {"models": models}
                else:
                    # Try /models if /api/tags fails for ollama-cloud (unlikely but safe)
                    resp = await client.get(f"{base_url}/models", headers=headers, timeout=5.0)
                    if resp.status_code == 200:
                        data = resp.json()
                        models = [m.get("id") or m.get("name") for m in data.get("data", [])]
                        return {"models": models}
            
            elif provider == "openai-compat":
                # Primarily check /api/tags first as per user request for their base URL
                resp = await client.get(f"{base_url}/api/tags", headers=headers, timeout=5.0)
                if resp.status_code == 200:
                    data = resp.json()
                    models = [m["name"] for m in data.get("models", [])]
                    return {"models": models}
                
                # Fallback to standard OpenAI /models
                resp = await client.get(f"{base_url}/models", headers=headers, timeout=5.0)
                if resp.status_code == 200:
                    data = resp.json()
                    models = [m.get("id") or m.get("name") for m in data.get("data", [])]
                    return {"models": models}
                    # OpenAI /models returns [{"id": "model-name", ...}, ...]
                    models = [m["id"] for m in data.get("data", [])]
                    return {"models": models}
            
            logger.warning(f"Failed to fetch models: {resp.status_code}")
            return {"models": []}
    except Exception as e:
        logger.error(f"Error fetching models for {provider}: {e}")
        return {"models": []}


# ─── Personality Settings (Humanoid Agent) ────────────────────────────────────

@router.get("/personality")
async def get_personality_endpoint():
    """Returns the current personality configuration."""
    config = await get_personality_config()
    if config:
        config.pop("id", None)
        config.pop("updated_at", None)
    return config or {}

@router.post("/personality")
async def update_personality_endpoint(config: dict):
    """Updates the personality configuration."""
    await update_personality_config(config)

    from app.graph.humanoid.personality_engine import set_personality
    set_personality(config)

    from app.graph.agent import reset_agent
    reset_agent()

    return {"status": "success"}

@router.post("/personality/reset")
async def reset_personality_endpoint():
    """Resets personality to defaults."""
    from app.graph.humanoid.config import DEFAULT_PERSONALITY
    await update_personality_config(DEFAULT_PERSONALITY)

    from app.graph.humanoid.personality_engine import set_personality
    set_personality(DEFAULT_PERSONALITY)

    from app.graph.agent import reset_agent
    reset_agent()

    return {"status": "success", "config": DEFAULT_PERSONALITY}

@router.get("/personality/presets")
async def get_personality_presets():
    """Returns available personality presets."""
    from app.graph.humanoid.config import PERSONALITY_PRESETS
    return PERSONALITY_PRESETS
