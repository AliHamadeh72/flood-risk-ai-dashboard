from __future__ import annotations

import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split


ROOT = Path(__file__).resolve().parents[1]
FEATURES_FILE = ROOT / "data" / "processed" / "features.csv"
MODEL_DIR = ROOT / "ml" / "model"

FEATURE_COLUMNS = [
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
    "population_density",
]


def main() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    data = pd.read_csv(FEATURES_FILE)
    x = data[FEATURE_COLUMNS]
    y = data["risk_label"]
    stratify = y if y.value_counts().min() >= 2 else None
    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.25, random_state=42, stratify=stratify)

    model = RandomForestClassifier(n_estimators=220, random_state=42, class_weight="balanced", min_samples_leaf=2)
    model.fit(x_train, y_train)

    predictions = model.predict(x_test)
    metrics = {
        "accuracy": accuracy_score(y_test, predictions),
        "classification_report": classification_report(y_test, predictions, output_dict=True, zero_division=0),
        "confusion_matrix": confusion_matrix(y_test, predictions, labels=["Low", "Medium", "High"]).tolist(),
        "labels": ["Low", "Medium", "High"],
        "model_type": "RandomForestClassifier",
        "feature_columns": FEATURE_COLUMNS,
    }

    joblib.dump(model, MODEL_DIR / "flood_risk_model.joblib")
    (MODEL_DIR / "feature_columns.json").write_text(json.dumps(FEATURE_COLUMNS, indent=2), encoding="utf-8")
    (MODEL_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"Saved model and metrics to {MODEL_DIR}")


if __name__ == "__main__":
    main()
