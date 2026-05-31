from __future__ import annotations

import json
import os
import re
import sys
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, TypedDict

try:
    import requests
except ImportError:  # Deterministic data extraction still works without requests.
    requests = None


ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT))

try:
    from rag.retrieve_context import retrieve
except Exception:  # The JSON database fallback is the primary chatbot data source.
    retrieve = None


PREDICTIONS_FILE = ROOT / "data" / "predictions" / "risk_predictions.json"

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

SYSTEM_PROMPT = (
    "You are the Flood Risk AI Dashboard chatbot. Be friendly, concise, and conversational. "
    "For ordinary conversation, answer naturally. For flood-risk data questions, use only the supplied dashboard records. "
    "Never invent cadaster names, scores, rainfall values, alerts, or official emergency orders. "
    "If the supplied data does not answer the question, say what is unavailable and suggest a better query."
)

DATA_TERMS = (
    "cadaster",
    "cadasters",
    "region",
    "regions",
    "area",
    "areas",
    "risk",
    "score",
    "scores",
    "prediction",
    "predictions",
    "forecast",
    "rain",
    "rainfall",
    "driver",
    "drivers",
    "recommended action",
    "highest",
    "lowest",
    "top",
    "current",
    "dataset",
    "records",
    "map",
    "zoom",
    "select",
)

STOPWORDS = {
    "a",
    "about",
    "and",
    "are",
    "for",
    "give",
    "in",
    "is",
    "me",
    "of",
    "please",
    "show",
    "tell",
    "the",
    "to",
    "what",
    "which",
}

PLACE_ALIASES = {
    "beirut": {"beirut", "beyrouth"},
    "beyrouth": {"beirut", "beyrouth"},
}


class ChatMessage(TypedDict):
    role: Literal["user", "assistant", "system"]
    content: str


def _normalize(value: str) -> str:
    ascii_text = unicodedata.normalize("NFD", value.lower())
    ascii_text = "".join(char for char in ascii_text if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", ascii_text).strip()


@lru_cache(maxsize=1)
def _predictions() -> list[dict[str, Any]]:
    if not PREDICTIONS_FILE.exists():
        return []
    return json.loads(PREDICTIONS_FILE.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _prediction_index() -> tuple[dict[str, dict[str, Any]], list[tuple[str, dict[str, Any]]]]:
    by_id: dict[str, dict[str, Any]] = {}
    names: list[tuple[str, dict[str, Any]]] = []
    for record in _predictions():
        by_id[str(record.get("region_id", ""))] = record
        normalized_name = _normalize(str(record.get("region_name", "")))
        if len(normalized_name) > 2:
            names.append((normalized_name, record))
    names.sort(key=lambda item: len(item[0]), reverse=True)
    return by_id, names


def _mentioned_cadaster(question: str) -> dict[str, Any] | None:
    by_id, names = _prediction_index()
    code_match = re.search(r"\b\d{3,}\b", question)
    if code_match and code_match.group(0) in by_id:
        return by_id[code_match.group(0)]

    normalized_question = f" {_normalize(question)} "
    for normalized_name, record in names:
        if f" {normalized_name} " in normalized_question:
            return record
    return None


def _place_matches(question: str, limit: int = 5) -> list[dict[str, Any]]:
    normalized = _normalize(question)
    query_terms = {
        term
        for term in normalized.split()
        if len(term) > 2 and term not in STOPWORDS and term not in DATA_TERMS
    }
    expanded_terms = set(query_terms)
    for term in query_terms:
        expanded_terms.update(PLACE_ALIASES.get(term, set()))
    if not expanded_terms:
        return []

    matches: list[tuple[int, float, dict[str, Any]]] = []
    for record in _predictions():
        normalized_name = _normalize(str(record.get("region_name", "")))
        score = sum(1 for term in expanded_terms if term in normalized_name.split() or term in normalized_name)
        if score:
            matches.append((score, _risk_score(record), record))
    matches.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return [record for _, _, record in matches[:limit]]


def _is_guidance_request(question: str) -> bool:
    normalized = _normalize(question)
    guidance_terms = ("how", "should", "prepare", "before", "during", "after", "safety", "instruction", "instructions", "advice", "tips", "guide", "guidance", "evacuate")
    flood_terms = ("flood", "floods", "flooding", "water", "rain")
    return any(term in normalized for term in guidance_terms) and any(term in normalized for term in flood_terms)


def _is_data_request(question: str) -> bool:
    normalized = _normalize(question)
    if _mentioned_cadaster(question):
        return True
    if re.search(r"\b\d{3,}\b", question):
        return True
    return any(term in normalized for term in DATA_TERMS)


def _risk_score(record: dict[str, Any]) -> float:
    try:
        return float(record.get("risk_score") or 0)
    except (TypeError, ValueError):
        return 0.0


def _format_record(record: dict[str, Any]) -> str:
    score = round(_risk_score(record) * 100)
    rainfall_7d = record.get("rainfall_7d", "unknown")
    return (
        f"{record.get('region_name')} (cadaster {record.get('region_id')}): "
        f"{record.get('risk_label')} risk, score {score}%, date {record.get('date')}, "
        f"7-day rainfall {rainfall_7d} mm, drivers: {record.get('main_drivers')}, "
        f"recommended action: {record.get('recommended_action')}"
    )


def _top_records(question: str) -> list[dict[str, Any]]:
    records = [record for record in _predictions() if str(record.get("region_name", "")).lower() != "conflict"]
    if "lowest" in _normalize(question):
        return sorted(records, key=_risk_score)[:5]
    return sorted(records, key=_risk_score, reverse=True)[:5]


def _data_context(question: str) -> str:
    records = _predictions()
    if not records:
        return "No prediction records are loaded."

    mentioned = _mentioned_cadaster(question)
    if mentioned:
        return "Matched cadaster record:\n- " + _format_record(mentioned)

    place_matches = _place_matches(question)
    if place_matches:
        return "Matched place-name records:\n" + "\n".join(f"- {_format_record(record)}" for record in place_matches)

    normalized = _normalize(question)
    if any(term in normalized for term in ("highest", "top", "lowest")):
        selected = _top_records(question)
        positive_count = sum(1 for record in records if _risk_score(record) > 0)
        if positive_count == 0 and "lowest" not in normalized:
            summary = "No cadaster currently has a positive flood-risk score in the loaded prediction records."
        else:
            summary = f"{positive_count} of {len(records)} records have a positive flood-risk score."
        lines = "\n".join(f"- {_format_record(record)}" for record in selected)
        return f"{summary}\nRelevant records:\n{lines}"

    if any(term in normalized for term in ("summary", "dataset", "records", "current", "prediction", "predictions")):
        positive_count = sum(1 for record in records if _risk_score(record) > 0)
        high_count = sum(1 for record in records if str(record.get("risk_label")) == "High")
        medium_count = sum(1 for record in records if str(record.get("risk_label")) == "Medium")
        low_count = sum(1 for record in records if str(record.get("risk_label")) == "Low")
        dates = sorted({str(record.get("date")) for record in records if record.get("date")})
        return (
            f"Dataset summary: {len(records)} cadaster prediction records. "
            f"Dates: {', '.join(dates[-3:]) if dates else 'unknown'}. "
            f"Positive flood-risk scores: {positive_count}. Labels: {high_count} High, {medium_count} Medium, {low_count} Low."
        )

    fallback_lines: list[str] = []
    if retrieve is not None:
        try:
            fallback_lines = [f"- {match['text']}" for match in retrieve(question, top_k=3)]
        except Exception:
            fallback_lines = []
    if fallback_lines:
        return "Retrieved dashboard records:\n" + "\n".join(fallback_lines)

    selected = _top_records(question)
    return "Most relevant available records:\n" + "\n".join(f"- {_format_record(record)}" for record in selected[:3])


def _ollama_chat(messages: list[ChatMessage], *, timeout: int = 45) -> str | None:
    if requests is None:
        return None

    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    model = os.getenv("OLLAMA_MODEL", "llama3.1")
    api_key = os.getenv("OLLAMA_API_KEY")
    allow_without_key = os.getenv("USE_OLLAMA_WITHOUT_KEY", "").lower() in {"1", "true", "yes"}
    if not api_key and not allow_without_key:
        return None

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    response = requests.post(
        f"{base_url}/api/chat",
        headers=headers,
        json={"model": model, "stream": False, "messages": messages},
        timeout=timeout,
    )
    response.raise_for_status()
    payload = response.json()
    message = payload.get("message", {})
    return message.get("content") or payload.get("response")


def _fallback_chat(question: str) -> str:
    normalized = _normalize(question)
    if any(term in normalized.split() for term in ("hello", "hi", "hey", "salam", "bonjour")):
        return (
            "Hello, I am the Flood Risk AI Dashboard chatbot. I can chat normally, and when you ask for dashboard data "
            "I can look up cadaster flood-risk predictions."
        )
    if "thank" in normalized or "thanks" in normalized or "merci" in normalized:
        return "You are welcome. Ask me about a cadaster, risk score, rainfall driver, or flood safety steps anytime."
    return (
        "I can help with general conversation and flood-risk dashboard questions. "
        "Ask for a cadaster name, a risk score, the highest-risk areas, or flood safety guidance."
    )


def answer_question(question: str, history: list[ChatMessage] | None = None) -> str:
    clean_question = question.strip()
    if not clean_question:
        return "Please send a message."

    if _is_guidance_request(clean_question):
        return FLOOD_GUIDANCE

    history_messages = [
        message
        for message in (history or [])[-8:]
        if message.get("role") in {"user", "assistant"} and str(message.get("content", "")).strip()
    ]

    if _is_data_request(clean_question):
        context = _data_context(clean_question)
        messages: list[ChatMessage] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            *history_messages,
            {
                "role": "user",
                "content": (
                    "Answer the user's flood-risk data question using only this dashboard context. "
                    "Be natural and concise, cite the cadaster name/code when available, and mention that this is planning data.\n\n"
                    f"Dashboard context:\n{context}\n\nUser question: {clean_question}"
                ),
            },
        ]
        try:
            llm_response = _ollama_chat(messages)
            if llm_response:
                return llm_response
        except Exception:
            pass
        return (
            "Here is what I found in the dashboard records:\n"
            f"{context}\n\n"
            "Use this as planning data, not as an official emergency warning."
        )

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *history_messages,
        {"role": "user", "content": clean_question},
    ]
    try:
        llm_response = _ollama_chat(messages)
        if llm_response:
            return llm_response
    except Exception:
        pass
    return _fallback_chat(clean_question)
