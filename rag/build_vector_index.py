from __future__ import annotations

import json
from pathlib import Path

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer


ROOT = Path(__file__).resolve().parents[1]
STORE_DIR = ROOT / "rag" / "vector_store"
DOCS_FILE = STORE_DIR / "rag_documents.json"


def main() -> None:
    docs = json.loads(DOCS_FILE.read_text(encoding="utf-8"))
    vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2))
    matrix = vectorizer.fit_transform([doc["text"] for doc in docs])
    joblib.dump({"vectorizer": vectorizer, "matrix": matrix, "docs": docs}, STORE_DIR / "tfidf_index.joblib")
    print("Built local TF-IDF retrieval index")


if __name__ == "__main__":
    main()
