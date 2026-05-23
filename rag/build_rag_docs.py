from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
PREDICTIONS_FILE = ROOT / "data" / "predictions" / "risk_predictions.csv"
RAG_DIR = ROOT / "rag" / "vector_store"


def row_to_doc(row: pd.Series) -> dict[str, str]:
    text = (
        f"Region: {row.region_name}. Date: {row.date}. Predicted flood risk: {row.risk_label}. "
        f"Risk score: {row.risk_score}. Main drivers: {row.main_drivers}. "
        f"7-day rainfall is {row.rainfall_7d} mm, humidity is {row.humidity_avg_7d}%, "
        f"elevation mean is {row.elevation_mean} m, slope mean is {row.slope_mean}. "
        f"Recommended action: {row.recommended_action}"
    )
    return {"id": row.region_id, "region_name": row.region_name, "date": row.date, "text": text}


def main() -> None:
    RAG_DIR.mkdir(parents=True, exist_ok=True)
    predictions = pd.read_csv(PREDICTIONS_FILE)
    docs = [row_to_doc(row) for row in predictions.itertuples(index=False)]
    output = RAG_DIR / "rag_documents.json"
    output.write_text(json.dumps(docs, indent=2), encoding="utf-8")
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
