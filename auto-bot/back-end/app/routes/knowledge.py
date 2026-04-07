"""
app/routes/knowledge.py
PDF knowledge base management endpoints for the humanoid agent.
"""
import logging
import os
import shutil
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.graph.humanoid.config import PDF_DIR
from app.graph.humanoid.pdf_ingestor import (
    delete_source,
    get_stats,
    ingest_all_pdfs,
    ingest_pdf,
)
from app.db.database import (
    get_pdf_sources,
    save_pdf_source,
    delete_pdf_source,
    update_pdf_source_status,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """Upload a PDF file and ingest it into the knowledge base."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    PDF_DIR.mkdir(parents=True, exist_ok=True)

    safe_name = file.filename.replace(" ", "_")
    dest_path = PDF_DIR / safe_name

    try:
        contents = await file.read()
        dest_path.write_bytes(contents)

        await save_pdf_source(
            filename=safe_name,
            status="processing",
            file_size=len(contents),
        )

        result = ingest_pdf(dest_path)

        await update_pdf_source_status(
            filename=safe_name,
            status=result["status"],
            chunk_count=result.get("chunks", 0),
            total_pages=result.get("total_pages", 0),
            file_hash=result.get("file_hash", ""),
        )

        return result

    except Exception as e:
        logger.error(f"Upload failed for {safe_name}: {e}")
        await update_pdf_source_status(
            filename=safe_name,
            status="error",
            error_message=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ingest-all")
async def ingest_all():
    """Ingest all PDFs already in the data/pdfs directory."""
    try:
        results = ingest_all_pdfs()

        for r in results:
            await save_pdf_source(
                filename=r["filename"],
                status=r["status"],
                file_size=r.get("file_size", 0),
                chunk_count=r.get("chunks", 0),
                total_pages=r.get("total_pages", 0),
                file_hash=r.get("file_hash", ""),
            )

        success = sum(1 for r in results if r["status"] == "ready")
        failed = sum(1 for r in results if r["status"] == "error")

        return {
            "total": len(results),
            "success": success,
            "failed": failed,
            "results": results,
        }
    except Exception as e:
        logger.error(f"Ingest-all failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sources")
async def list_sources():
    """List all ingested PDF sources."""
    db_sources = await get_pdf_sources()
    stats = get_stats()
    return {
        "sources": db_sources,
        "stats": stats,
    }


@router.delete("/sources/{source_name}")
async def remove_source(source_name: str):
    """Delete a PDF source and all its chunks from the knowledge base."""
    deleted_count = delete_source(source_name)
    await delete_pdf_source(source_name)

    pdf_path = PDF_DIR / f"{source_name}.pdf"
    if pdf_path.exists():
        pdf_path.unlink()

    return {
        "source": source_name,
        "chunks_deleted": deleted_count,
        "message": f"Removed {source_name} and {deleted_count} chunks",
    }


@router.get("/stats")
async def knowledge_stats():
    """Get knowledge base statistics."""
    return get_stats()


@router.post("/search")
async def search_knowledge(query: dict):
    """Manual search for debugging/testing the RAG retrieval."""
    from app.graph.humanoid.rag_retriever import retrieve_context
    from app.graph.humanoid.emotion_analyzer import analyze_emotion

    text = query.get("query", "")
    if not text:
        raise HTTPException(status_code=400, detail="query field required")

    emotion = analyze_emotion(text)
    context = retrieve_context(text, emotion=emotion)

    return {
        "query": text,
        "emotion": emotion,
        "context": context,
        "context_length": len(context),
    }
