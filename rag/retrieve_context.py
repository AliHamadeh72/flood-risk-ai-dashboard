from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
from sklearn.metrics.pairwise import cosine_similarity


ROOT = Path(__file__).resolve().parents[1]
STORE_DIR = ROOT / "rag" / "vector_store"
INDEX_FILE = STORE_DIR / "tfidf_index.joblib"
DOCS_FILE = STORE_DIR / "rag_documents.json"


def retrieve(query: str, top_k: int = 3) -> list[dict[str, str | float]]:
    if INDEX_FILE.exists():
        index = joblib.load(INDEX_FILE)
        query_vector = index["vectorizer"].transform([query])
        scores = cosine_similarity(query_vector, index["matrix"]).ravel()
        order = scores.argsort()[::-1][:top_k]
        return [{**index["docs"][idx], "score": round(float(scores[idx]), 3)} for idx in order if scores[idx] > 0]

    docs = json.loads(DOCS_FILE.read_text(encoding="utf-8"))
    query_terms = set(query.lower().split())
    scored = []
    for doc in docs:
        overlap = len(query_terms.intersection(doc["text"].lower().split()))
        if overlap:
            scored.append({**doc, "score": float(overlap)})
    return sorted(scored, key=lambda item: item["score"], reverse=True)[:top_k]


def grounded_answer(query: str) -> str:
    matches = retrieve(query)
    if not matches:
        return "The requested information is unavailable in the current flood-risk records."
    context = "\n".join(f"- {match['text']}" for match in matches)
    return (
        "Based only on the retrieved flood-risk records:\n"
        f"{context}\n\n"
        "Use these results for planning support only, not as an official emergency warning."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Retrieve flood-risk RAG context.")
    parser.add_argument("query")
    parser.add_argument("--top-k", type=int, default=3)
    args = parser.parse_args()
    for match in retrieve(args.query, args.top_k):
        print(f"[{match['score']}] {match['text']}")


if __name__ == "__main__":
    main()
