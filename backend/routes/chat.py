from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from services.rag_service import answer_question


router = APIRouter()


class ChatRequest(BaseModel):
    question: str
    history: list[dict[str, str]] = Field(default_factory=list)


@router.post("/chat")
def chat(request: ChatRequest) -> dict[str, str]:
    return {"answer": answer_question(request.question, request.history)}
