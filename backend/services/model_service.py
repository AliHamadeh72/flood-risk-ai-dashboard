from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PREDICTIONS_JSON = ROOT / "data" / "predictions" / "risk_predictions.json"
PREDICTIONS_CSV = ROOT / "data" / "predictions" / "risk_predictions.csv"
CADASTERS_GEOJSON = ROOT / "data" / "geo" / "cadasters.geojson"


def load_predictions() -> list[dict]:
    if PREDICTIONS_JSON.exists():
        return json.loads(PREDICTIONS_JSON.read_text(encoding="utf-8"))

    import pandas as pd

    return pd.read_csv(PREDICTIONS_CSV).to_dict(orient="records")


def load_regions() -> dict:
    return json.loads(CADASTERS_GEOJSON.read_text(encoding="utf-8"))


def run_latest_prediction() -> dict[str, str]:
    subprocess.run([sys.executable, str(ROOT / "ml" / "build_open_meteo_predictions.py")], check=True)
    return {"status": "Open-Meteo cadaster predictions exported"}
