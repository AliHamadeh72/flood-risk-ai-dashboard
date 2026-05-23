from __future__ import annotations

import json
from pathlib import Path

import joblib
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
FEATURES_FILE = ROOT / "data" / "processed" / "features.csv"
MODEL_FILE = ROOT / "ml" / "model" / "flood_risk_model.joblib"
FEATURE_COLUMNS_FILE = ROOT / "ml" / "model" / "feature_columns.json"
PREDICTIONS_DIR = ROOT / "data" / "predictions"
FRONTEND_DATA_DIR = ROOT / "frontend" / "src" / "data"


def driver_text(row: pd.Series) -> str:
    drivers = []
    if row["rainfall_7d"] >= 65:
        drivers.append("high 7-day rainfall")
    elif row["rainfall_7d"] >= 40:
        drivers.append("moderate 7-day rainfall")
    else:
        drivers.append("lower weekly rainfall")
    if row["elevation_mean"] < 50:
        drivers.append("low elevation")
    if row["slope_mean"] < 2.5:
        drivers.append("low slope")
    if row["distance_to_river_km"] < 0.8:
        drivers.append("close river proximity")
    return "; ".join(drivers)


def recommendation(label: str) -> str:
    if label == "High":
        return "Prioritize drainage inspection, field monitoring, and public advisory preparation."
    if label == "Medium":
        return "Monitor low-lying roads and keep drainage crews on standby."
    return "Continue routine monitoring and review rainfall trend updates."


def main() -> None:
    PREDICTIONS_DIR.mkdir(parents=True, exist_ok=True)
    FRONTEND_DATA_DIR.mkdir(parents=True, exist_ok=True)
    data = pd.read_csv(FEATURES_FILE)
    latest = data.sort_values("date").groupby("region_id", as_index=False).tail(1).copy()

    model = joblib.load(MODEL_FILE)
    feature_columns = json.loads(FEATURE_COLUMNS_FILE.read_text(encoding="utf-8"))
    probabilities = model.predict_proba(latest[feature_columns])
    labels = model.classes_

    latest["risk_label"] = model.predict(latest[feature_columns])
    latest["risk_score"] = [round(float(max(row)), 2) for row in probabilities]
    latest["main_drivers"] = latest.apply(driver_text, axis=1)
    latest["recommended_action"] = latest["risk_label"].map(recommendation)

    export_columns = [
        "region_id",
        "region_name",
        "date",
        "latitude",
        "longitude",
        "rainfall_1d",
        "rainfall_3d",
        "rainfall_7d",
        "rainfall_14d",
        "humidity_avg_3d",
        "humidity_avg_7d",
        "temperature_avg_7d",
        "wind_avg_7d",
        "elevation_mean",
        "slope_mean",
        "distance_to_river_km",
        "risk_label",
        "risk_score",
        "main_drivers",
        "recommended_action",
    ]
    latest = latest[export_columns].round(2)
    latest.to_csv(PREDICTIONS_DIR / "risk_predictions.csv", index=False)
    json_text = latest.to_json(orient="records", indent=2)
    (PREDICTIONS_DIR / "risk_predictions.json").write_text(json_text, encoding="utf-8")
    (FRONTEND_DATA_DIR / "risk_predictions.json").write_text(json_text, encoding="utf-8")
    print(f"Exported latest predictions for classes: {', '.join(labels)}")


if __name__ == "__main__":
    main()
