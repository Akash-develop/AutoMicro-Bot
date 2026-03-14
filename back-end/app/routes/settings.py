from fastapi import APIRouter
from app.graph.tools.permission_manager import load_permissions, save_permissions
from app.db.chroma import get_all_memories, delete_memory, clear_all_memories
from pydantic import BaseModel

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

@router.get("/memory")
async def get_memories_endpoint():
    """Retrieve all stored long-term memories."""
    return {"status": "success", "memories": get_all_memories()}

@router.delete("/memory/{memory_id}")
async def delete_memory_endpoint(memory_id: str):
    """Delete a specific long-term memory."""
    success = delete_memory(memory_id)
    if success:
        return {"status": "success", "deleted": memory_id}
    return {"status": "error", "message": "Failed to delete memory"}

@router.delete("/memory")
async def clear_all_memories_endpoint():
    """Clear all long-term memories."""
    success = clear_all_memories()
    if success:
        return {"status": "success", "message": "All memories cleared"}
    return {"status": "error", "message": "Failed to clear memories"}
