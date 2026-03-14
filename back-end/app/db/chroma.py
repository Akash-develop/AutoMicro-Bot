import os
import uuid
import chromadb
from dotenv import load_dotenv

load_dotenv()

# Set up ChromaDB storage
CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_db")
client = chromadb.PersistentClient(path=CHROMA_DB_PATH)

# Using the default embedding function (all-MiniLM-L6-v2) within Chroma
# This will be downloaded automatically the first time if not cached.
COLLECTION_NAME = "long_term_memory"
try:
    collection = client.get_or_create_collection(name=COLLECTION_NAME)
except Exception as e:
    # Fallback in case of strange initialization errors
    print(f"Error creating ChromaDB collection: {e}")
    collection = client.create_collection(name=COLLECTION_NAME)

def save_memory(text: str) -> str:
    """Save a text fact into the long-term memory."""
    memory_id = str(uuid.uuid4())
    collection.add(
        documents=[text],
        metadatas=[{"source": "user_interaction"}],
        ids=[memory_id]
    )
    return memory_id

def search_memory(query: str, n_results: int = 3) -> list[str]:
    """Search for relevant facts based on a query."""
    if collection.count() == 0:
        return []
    
    # Don't ask for more results than we have
    n_results = min(n_results, collection.count())
    
    results = collection.query(
        query_texts=[query],
        n_results=n_results
    )
    
    if results and "documents" in results and results["documents"]:
        return results["documents"][0] # Return the list of matched documents
    return []

def get_all_memories() -> list[dict]:
    """Retrieve all saved memories."""
    if collection.count() == 0:
        return []
    
    results = collection.get()
    
    memories = []
    if results and "ids" in results and "documents" in results:
        for i in range(len(results["ids"])):
            memories.append({
                "id": results["ids"][i],
                "text": results["documents"][i]
            })
    return memories

def delete_memory(memory_id: str) -> bool:
    """Delete a specific memory by its ID."""
    try:
        collection.delete(ids=[memory_id])
        return True
    except Exception as e:
        print(f"Error deleting memory {memory_id}: {e}")
        return False

def clear_all_memories() -> bool:
    """Clear all memories."""
    try:
        # Simplest way is to drop and recreate the collection
        client.delete_collection(name=COLLECTION_NAME)
        global collection
        collection = client.create_collection(name=COLLECTION_NAME)
        return True
    except Exception as e:
        print(f"Error clearing memories: {e}")
        return False
