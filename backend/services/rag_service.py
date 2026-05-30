from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    import requests
except ImportError:  # Ollama rephrasing is optional; deterministic RAG still works without requests.
    requests = None


ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT))

from rag.retrieve_context import grounded_answer, retrieve


FLOOD_GUIDANCE = (
    "General flood safety guidance, based on American Red Cross recommendations:\n\n"
    "Before a flood: know your flood risk, prepare an emergency kit, protect important documents, "
    "and follow local alerts or evacuation instructions.\n"
    "During a flood: move to higher ground if told to evacuate, avoid walking or driving through floodwater, "
    "and stay away from fast-moving water and downed power lines.\n"
    "After a flood: return only when officials say it is safe, avoid contaminated floodwater, wear protective clothing "
    "during cleanup, and check for structural, electrical, or gas hazards before entering damaged buildings.\n\n"
    "For immediate danger, follow local emergency services and official evacuation orders."
)


def _normalized(question: str) -> str:
    return " ".join(question.lower().split())


def _is_greeting(question: str) -> bool:
    terms = set(_normalized(question).replace(",", " ").replace("!", " ").split())
    return bool(terms.intersection({"hello", "hi", "hey", "salam", "bonjour"}))


def _is_general_flood_guidance(question: str) -> bool:
    normalized = _normalized(question)
    guidance_terms = ("what", "how", "should", "prepare", "before", "during", "after", "safety", "instruction", "instructions", "advice", "tips", "guide", "guidance")
    flood_terms = ("flood", "floods", "flooding", "evacuat", "water", "rain")
    return any(term in normalized for term in guidance_terms) and any(term in normalized for term in flood_terms)


def _intro_answer() -> str:
    return (
        "Hello, I am the flood-risk dashboard assistant. I can summarize cadaster flood-risk records, "
        "explain the drivers behind a risk score, and share general flood safety guidance. "
        "This project is a planning prototype, not an official emergency warning system."
    )


def _llm_answer(question: str, context: str) -> str | None:
    if requests is None:
        return None

    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    model = os.getenv("OLLAMA_MODEL", "llama3.1")
    api_key = os.getenv("OLLAMA_API_KEY")
    if not api_key and not os.getenv("USE_OLLAMA_WITHOUT_KEY"):
        return None

    prompt = (
        "Rewrite the retrieved flood-risk records into natural, concise language for a dashboard user. "
        "Use only the supplied records for cadaster-specific facts. Keep numbers and labels faithful. "
        "If the records do not answer the question, say the project data is unavailable. "
        "Do not create emergency orders or official warnings.\n\n"
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
                {
                    "role": "system",
                    "content": (
                        "You are a flood-risk planning assistant. Rephrase retrieved project data in plain language. "
                        "Stay grounded in supplied records and do not invent cadaster values."
                    ),
                },
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
    if _is_greeting(question):
        return _intro_answer()
    if _is_general_flood_guidance(question):
        return FLOOD_GUIDANCE

    matches = retrieve(question, top_k=3)
    if not matches:
        return "The requested information is unavailable in the current flood-risk records."

    context = "\n".join(f"- {match['text']}" for match in matches)
    try:
        llm_response = _llm_answer(question, context)
        if llm_response:
            return llm_response
    except Exception:
        pass

    return grounded_answer(question)
