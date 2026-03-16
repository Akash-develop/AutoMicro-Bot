import os
import uuid
import logging
import chromadb
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Set up ChromaDB storage
CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_db")
try:
    client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
except Exception as e:
    logger.error(f"Failed to initialize ChromaDB client at {CHROMA_DB_PATH}: {e}")
    raise

COLLECTION_NAME = "long_term_memory"
try:
    collection = client.get_or_create_collection(name=COLLECTION_NAME)
except Exception as e:
    logger.error(f"Error getting/creating ChromaDB collection '{COLLECTION_NAME}': {e}")
    # We don't want to crash the whole app if memory fails, but we should be aware
    collection = None

def save_memory(text: str) -> str:
    """Save a text fact into the long-term memory."""
    if not collection:
        logger.warning("Attempted to save memory but ChromaDB collection is not initialized.")
        return ""
    
    try:
        memory_id = str(uuid.uuid4())
        collection.add(
            documents=[text],
            metadatas=[{"source": "user_interaction"}],
            ids=[memory_id]
        )
        return memory_id
    except Exception as e:
        logger.error(f"Failed to save memory: {e}")
        return ""

def search_memory(query: str, n_results: int = 3) -> list[str]:
    """Search for relevant facts based on a query."""
    if not collection or collection.count() == 0:
        return []
    
    try:
        # Don't ask for more results than we have
        n_results = min(n_results, collection.count())
        
        results = collection.query(
            query_texts=[query],
            n_results=n_results
        )
        
        if results and "documents" in results and results["documents"]:
            return results["documents"][0] # Return the list of matched documents
    except Exception as e:
        logger.error(f"Error searching ChromaDB memory: {e}")
        
    return []

def get_all_memories() -> list[dict]:
    """Retrieve all saved memories."""
    if not collection or collection.count() == 0:
        return []
    
    try:
        results = collection.get()
        
        memories = []
        if results and "ids" in results and "documents" in results:
            for i in range(len(results["ids"])):
                memories.append({
                    "id": results["ids"][i],
                    "text": results["documents"][i]
                })
        return memories
    except Exception as e:
        logger.error(f"Error retrieving all memories from ChromaDB: {e}")
        return []

def delete_memory(memory_id: str) -> bool:
    """Delete a specific memory by its ID."""
    if not collection:
        return False
        
    try:
        collection.delete(ids=[memory_id])
        return True
    except Exception as e:
        logger.error(f"Error deleting memory {memory_id}: {e}")
        return False

def clear_all_memories() -> bool:
    """Clear all memories."""
    global collection
    if not client:
        return False
        
    try:
        # Simplest way is to drop and recreate the collection
        client.delete_collection(name=COLLECTION_NAME)
        collection = client.create_collection(name=COLLECTION_NAME)
        return True
    except Exception as e:
        logger.error(f"Error clearing memories from ChromaDB: {e}")
        return False
