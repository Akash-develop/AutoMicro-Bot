"""
app/graph/humanoid/pdf_ingestor.py
Extracts text from PDFs, chunks intelligently, tags with metadata,
generates embeddings, and stores in ChromaDB.
"""
import hashlib
import logging
import os
from pathlib import Path

import chromadb
import pdfplumber
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.graph.humanoid.config import (
    CATEGORY_KEYWORDS,
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    CHROMA_DIR,
    COLLECTION_NAME,
    PDF_DIR,
    SEPARATORS,
)

logger = logging.getLogger(__name__)

_client: chromadb.ClientAPI | None = None
_collection: chromadb.Collection | None = None


def _get_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        CHROMA_DIR.mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    return _client


def get_collection() -> chromadb.Collection:
    global _collection
    if _collection is None:
        client = _get_client()
        _collection = client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def _file_hash(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def _extract_text(pdf_path: Path) -> list[dict]:
    """Extract text from PDF, returning list of {page, text}."""
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            text = text.strip()
            if text:
                pages.append({"page": i, "text": text})
    return pages


def _detect_categories(text: str) -> list[str]:
    """Auto-detect categories from chunk text using keyword matching."""
    text_lower = text.lower()
    matches = []
    for category, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in text_lower)
        if score >= 2:
            matches.append((category, score))
    matches.sort(key=lambda x: x[1], reverse=True)
    return [m[0] for m in matches[:3]] if matches else ["general"]


def _chunk_pages(pages: list[dict], source_name: str) -> list[dict]:
    """Split page texts into overlapping chunks with metadata."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=SEPARATORS,
        length_function=len,
    )

    all_chunks = []
    full_text_by_page: list[tuple[int, str]] = [(p["page"], p["text"]) for p in pages]

    combined_text = "\n\n".join(p["text"] for p in pages)
    raw_chunks = splitter.split_text(combined_text)

    char_offset = 0
    page_boundaries = []
    for page_num, page_text in full_text_by_page:
        page_boundaries.append((char_offset, char_offset + len(page_text), page_num))
        char_offset += len(page_text) + 2  # +2 for "\n\n"

    search_offset = 0
    for idx, chunk_text in enumerate(raw_chunks):
        chunk_pos = combined_text.find(chunk_text[:100], search_offset)
        if chunk_pos >= 0:
            search_offset = chunk_pos

        page_num = 1
        for start, end, pn in page_boundaries:
            if chunk_pos >= start:
                page_num = pn

        categories = _detect_categories(chunk_text)

        all_chunks.append({
            "id": f"{source_name}__chunk_{idx:04d}",
            "text": chunk_text,
            "metadata": {
                "source_pdf": source_name,
                "page": page_num,
                "chunk_index": idx,
                "categories": ",".join(categories),
                "char_count": len(chunk_text),
            },
        })

    return all_chunks


def ingest_pdf(pdf_path: str | Path) -> dict:
    """
    Full pipeline: extract → chunk → store in ChromaDB.
    Returns stats dict.
    """
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    source_name = pdf_path.stem
    file_hash = _file_hash(pdf_path)

    collection = get_collection()

    existing = collection.get(where={"source_pdf": source_name})
    if existing and existing["ids"]:
        collection.delete(ids=existing["ids"])
        logger.info(f"Removed {len(existing['ids'])} old chunks for {source_name}")

    logger.info(f"Extracting text from {pdf_path.name}...")
    pages = _extract_text(pdf_path)
    if not pages:
        return {"filename": pdf_path.name, "status": "error", "error": "No text extracted", "chunks": 0, "pages": 0}

    logger.info(f"Chunking {len(pages)} pages...")
    chunks = _chunk_pages(pages, source_name)

    BATCH_SIZE = 100
    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i : i + BATCH_SIZE]
        collection.add(
            ids=[c["id"] for c in batch],
            documents=[c["text"] for c in batch],
            metadatas=[c["metadata"] for c in batch],
        )

    logger.info(f"Ingested {len(chunks)} chunks from {pdf_path.name}")

    return {
        "filename": pdf_path.name,
        "source_name": source_name,
        "file_hash": file_hash,
        "status": "ready",
        "chunks": len(chunks),
        "pages": len(pages),
        "total_pages": len(pages),
        "file_size": pdf_path.stat().st_size,
    }


def ingest_all_pdfs() -> list[dict]:
    """Ingest all PDFs in the data/pdfs directory."""
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    results = []
    for pdf_file in sorted(PDF_DIR.glob("*.pdf")):
        try:
            result = ingest_pdf(pdf_file)
            results.append(result)
        except Exception as e:
            logger.error(f"Failed to ingest {pdf_file.name}: {e}")
            results.append({
                "filename": pdf_file.name,
                "status": "error",
                "error": str(e),
                "chunks": 0,
                "pages": 0,
            })
    return results


def delete_source(source_name: str) -> int:
    """Delete all chunks for a given source PDF. Returns count deleted."""
    collection = get_collection()
    existing = collection.get(where={"source_pdf": source_name})
    if existing and existing["ids"]:
        collection.delete(ids=existing["ids"])
        return len(existing["ids"])
    return 0


def get_stats() -> dict:
    """Get collection statistics."""
    collection = get_collection()
    count = collection.count()

    sources = {}
    if count > 0:
        all_data = collection.get(include=["metadatas"])
        for meta in all_data["metadatas"]:
            src = meta.get("source_pdf", "unknown")
            sources[src] = sources.get(src, 0) + 1

    return {
        "total_chunks": count,
        "sources": sources,
        "collection_name": COLLECTION_NAME,
        "chroma_path": str(CHROMA_DIR),
    }
