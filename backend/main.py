"""FastAPI backend for LLM Council (multi-tenant)."""

import os
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any
import json
import asyncio

from sqlalchemy.ext.asyncio import AsyncSession

from . import storage
from . import clerk_keys
from .auth import get_current_user
from .db import get_session
from .models import User
from .council import (
    run_full_council,
    generate_conversation_title,
    stage1_collect_responses,
    stage2_collect_rankings,
    stage3_synthesize_final,
    calculate_aggregate_rankings,
    build_user_prompt,
)
from .documents import (
    extract_text,
    is_supported,
    UnsupportedFileType,
    FileTooLarge,
    MAX_FILE_BYTES,
    MAX_FILES,
)

app = FastAPI(title="LLM Council API")

# CORS: allowed origins come from the environment (comma-separated).
_cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CreateConversationRequest(BaseModel):
    """Request to create a new conversation."""
    pass


class ConversationMetadata(BaseModel):
    """Conversation metadata for list view."""
    id: str
    created_at: str
    title: str
    message_count: int


class Conversation(BaseModel):
    """Full conversation with all messages."""
    id: str
    created_at: str
    title: str
    messages: List[Dict[str, Any]]


async def _read_uploads(files: List[UploadFile]) -> List[Dict[str, Any]]:
    """Validate and extract text from uploaded files. Raises HTTPException on rejection."""
    files = [f for f in files if f and f.filename]
    if len(files) > MAX_FILES:
        raise HTTPException(
            status_code=413,
            detail=f"Too many files (max {MAX_FILES})",
        )

    documents: List[Dict[str, Any]] = []
    for upload in files:
        if not is_supported(upload.filename):
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file type: {upload.filename}",
            )
        data = await upload.read()
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"{upload.filename} exceeds {MAX_FILE_BYTES} bytes",
            )
        try:
            text = extract_text(upload.filename, data)
        except UnsupportedFileType as e:
            raise HTTPException(status_code=415, detail=str(e))
        except FileTooLarge as e:
            raise HTTPException(status_code=413, detail=str(e))
        documents.append({"filename": upload.filename, "text": text})
    return documents


def _merge_documents(
    prior: List[Dict[str, Any]],
    current: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Combine prior-turn and current-turn documents; current wins on filename collision."""
    by_name: Dict[str, Dict[str, Any]] = {d["filename"]: d for d in prior}
    for d in current:
        by_name[d["filename"]] = d
    return list(by_name.values())


async def _require_key(user: User) -> str:
    """Fetch the caller's OpenRouter key from Clerk or raise 409."""
    try:
        return await clerk_keys.get_openrouter_key(user.clerk_id)
    except clerk_keys.NoKeyError:
        raise HTTPException(status_code=409, detail="no_openrouter_key")


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "LLM Council API"}


@app.get("/api/conversations", response_model=List[ConversationMetadata])
async def list_conversations(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List the authenticated user's conversations (metadata only)."""
    return await storage.list_conversations(session, user.id)


@app.post("/api/conversations", response_model=Conversation)
async def create_conversation(
    request: CreateConversationRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a new conversation for the authenticated user."""
    return await storage.create_conversation(session, user.id)


@app.get("/api/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(
    conversation_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get a specific conversation owned by the authenticated user."""
    conversation = await storage.get_conversation(session, user.id, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@app.post("/api/conversations/{conversation_id}/message")
async def send_message(
    conversation_id: str,
    content: str = Form(...),
    files: List[UploadFile] = File(default_factory=list),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Send a message and run the 3-stage council process.
    Returns the complete response with all stages.
    """
    conversation = await storage.get_conversation(session, user.id, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    api_key = await _require_key(user)

    new_documents = await _read_uploads(files)
    prior_documents = storage.collect_conversation_documents(conversation)
    all_documents = _merge_documents(prior_documents, new_documents)

    is_first_message = len(conversation["messages"]) == 0

    await storage.add_user_message(session, conversation_id, content, new_documents)

    if is_first_message:
        title = await generate_conversation_title(content, api_key)
        await storage.update_conversation_title(session, conversation_id, title)

    stage1_results, stage2_results, stage3_result, metadata = await run_full_council(
        content, api_key, all_documents
    )

    await storage.add_assistant_message(
        session, conversation_id, stage1_results, stage2_results, stage3_result
    )

    return {
        "stage1": stage1_results,
        "stage2": stage2_results,
        "stage3": stage3_result,
        "metadata": metadata,
    }


@app.post("/api/conversations/{conversation_id}/message/stream")
async def send_message_stream(
    conversation_id: str,
    content: str = Form(...),
    files: List[UploadFile] = File(default_factory=list),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Send a message and stream the 3-stage council process via SSE.
    """
    conversation = await storage.get_conversation(session, user.id, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    api_key = await _require_key(user)

    new_documents = await _read_uploads(files)
    prior_documents = storage.collect_conversation_documents(conversation)
    all_documents = _merge_documents(prior_documents, new_documents)

    is_first_message = len(conversation["messages"]) == 0

    async def event_generator():
        try:
            await storage.add_user_message(
                session, conversation_id, content, new_documents
            )

            title_task = None
            if is_first_message:
                title_task = asyncio.create_task(
                    generate_conversation_title(content, api_key)
                )

            combined_prompt = build_user_prompt(content, all_documents)

            # Stage 1
            yield f"data: {json.dumps({'type': 'stage1_start'})}\n\n"
            stage1_results = await stage1_collect_responses(
                content, api_key, all_documents
            )
            yield f"data: {json.dumps({'type': 'stage1_complete', 'data': stage1_results})}\n\n"

            if not stage1_results:
                yield f"data: {json.dumps({'type': 'error', 'message': 'All council models failed to respond.'})}\n\n"
                return

            # Stage 2
            yield f"data: {json.dumps({'type': 'stage2_start'})}\n\n"
            stage2_results, label_to_model = await stage2_collect_rankings(
                combined_prompt, stage1_results, api_key
            )
            aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)
            yield f"data: {json.dumps({'type': 'stage2_complete', 'data': stage2_results, 'metadata': {'label_to_model': label_to_model, 'aggregate_rankings': aggregate_rankings}})}\n\n"

            # Stage 3
            yield f"data: {json.dumps({'type': 'stage3_start'})}\n\n"
            stage3_result = await stage3_synthesize_final(
                combined_prompt, stage1_results, stage2_results, api_key
            )
            yield f"data: {json.dumps({'type': 'stage3_complete', 'data': stage3_result})}\n\n"

            if title_task:
                title = await title_task
                await storage.update_conversation_title(
                    session, conversation_id, title
                )
                yield f"data: {json.dumps({'type': 'title_complete', 'data': {'title': title}})}\n\n"

            await storage.add_assistant_message(
                session, conversation_id, stage1_results, stage2_results, stage3_result
            )

            yield f"data: {json.dumps({'type': 'complete'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
