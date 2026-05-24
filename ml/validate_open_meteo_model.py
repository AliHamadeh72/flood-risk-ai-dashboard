from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from build_open_meteo_predictions import DEFAULT_CADASTERS, build_predictions, normalize_acs_code


ROOT = Path(__file__).resolve().parents[1]
TEST_DIR = ROOT / "data" / "test"


def validate(weather_csv: Path, flood_csv: Path, expected_csv: Path, cadasters_geojson: Path) -> dict[str, object]:
    expected = pd.read_csv(expected_csv)
    expected["ACS_Code"] = expected["ACS_Code"].map(normalize_acs_code)
    predictions = build_predictions(weather_csv, cadasters_geojson, flood_csv)
    merged = predictions.merge(expected, left_on="region_id", right_on="ACS_Code", how="inner")
    if merged.empty:
        raise ValueError("No overlap between predictions and expected test labels.")

    merged["correct"] = merged["risk_label"] == merged["expected_risk"]
    accuracy = float(merged["correct"].mean())
    distribution = predictions["risk_label"].value_counts().to_dict()
    missing_visual_classes = [label for label in ["Low", "Medium", "High"] if distribution.get(label, 0) == 0]
    return {
        "rows": int(len(merged)),
        "accuracy": round(accuracy, 3),
        "distribution": distribution,
        "missing_visual_classes": missing_visual_classes,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate Open-Meteo flood/weather scoring against deterministic test data.")
    parser.add_argument("--weather", type=Path, default=TEST_DIR / "open_meteo_weather_test.csv")
    parser.add_argument("--flood", type=Path, default=TEST_DIR / "open_meteo_flood_test.csv")
    parser.add_argument("--expected", type=Path, default=TEST_DIR / "open_meteo_expected_risk.csv")
    parser.add_argument("--cadasters-geojson", type=Path, default=DEFAULT_CADASTERS)
    args = parser.parse_args()

    result = validate(args.weather, args.flood, args.expected, args.cadasters_geojson)
    print(result)
    if result["accuracy"] < 1.0:
        raise SystemExit("Open-Meteo validation failed: expected deterministic labels did not match predictions.")
    if result["missing_visual_classes"]:
        raise SystemExit(f"Open-Meteo visualization validation failed: missing classes {result['missing_visual_classes']}")


if __name__ == "__main__":
    main()
