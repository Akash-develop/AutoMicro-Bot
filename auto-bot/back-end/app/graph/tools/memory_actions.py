from langchain_core.tools import tool
from app.db.chroma import save_memory

@tool
def save_long_term_memory(fact: str) -> str:
    """
    Save a specific fact about the user or the context to long-term memory.
    Use this tool when the user tells you personal details, preferences, or important facts 
    that you should remember for future conversations.
    """
    try:
        memory_id = save_memory(fact)
        return f"Successfully saved to long-term memory: '{fact}'"
    except Exception as e:
        return f"Failed to save long-term memory: {str(e)}"
