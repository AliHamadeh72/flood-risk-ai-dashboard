from __future__ import annotations

import os
import sys
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT))

from rag.retrieve_context import grounded_answer, retrieve


def _llm_answer(question: str, context: str) -> str | None:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    model = os.getenv("OLLAMA_MODEL", "llama3.1")
    api_key = os.getenv("OLLAMA_API_KEY")
    if not api_key and not os.getenv("USE_OLLAMA_WITHOUT_KEY"):
        return None

    prompt = (
        "You are a flood-risk planning assistant. Answer only from the retrieved records below. "
        "Do not invent values. If the records do not answer the question, say the data is unavailable. "
        "Provide practical planning recommendations, not emergency instructions.\n\n"
        f"Retrieved records:\n{context}\n\nQuestion: {question}"
    )
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    response = requests.post(
        f"{base_url}/api/chat",
        headers=headers,
        json={
            "model": model,
            "stream": False,
            "messages": [
                {"role": "system", "content": "Ground every answer in the supplied flood-risk records."},
                {"role": "user", "content": prompt},
            ],
        },
        timeout=45,
    )
    response.raise_for_status()
    payload = response.json()
    message = payload.get("message", {})
    return message.get("content") or payload.get("response")


def answer_question(question: str) -> str:
    if not question.strip():
        return "Please ask a question about the current flood-risk records."

    matches = retrieve(question, top_k=3)
    if not matches:
        return "The requested information is unavailable in the current flood-risk records."

    context = "\n".join(f"- {match['text']}" for match in matches)
    try:
        llm_response = _llm_answer(question, context)
        if llm_response:
            return llm_response
    except requests.RequestException:
        pass

    return grounded_answer(question)
