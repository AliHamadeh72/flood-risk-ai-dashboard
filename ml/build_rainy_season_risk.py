from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import pandas as pd

from build_open_meteo_predictions import normalize_acs_code


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CADASTERS = ROOT / "data" / "geo" / "cadasters.geojson"
DEFAULT_WEATHER_INPUT = ROOT / "data" / "raw" / "open_meteo" / "cadaster_weather_historical.csv"
DEFAULT_FLOOD_INPUT = ROOT / "data" / "raw" / "open_meteo" / "cadaster_flood_historical.csv"
PREDICTIONS_DIR = ROOT / "data" / "predictions"
FRONTEND_DATA_DIR = ROOT / "frontend" / "src" / "data"

RAINY_MONTHS = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03"]


def risk_label(score: float) -> str:
    if score >= 0.7:
        return "High"
    if score >= 0.4:
        return "Medium"
    return "Low"


def score_risk(rainfall_7d: float, humidity: float, soil_moisture: float | None, discharge_ratio: float | None) -> float:
    soil_component = 0 if soil_moisture is None or pd.isna(soil_moisture) else min(float(soil_moisture) * 100, 45)
    discharge_component = 0 if discharge_ratio is None or pd.isna(discharge_ratio) else min(float(discharge_ratio), 2.0) / 2.0
    return min(1.0, (rainfall_7d / 80) * 0.38 + (humidity / 100) * 0.17 + (soil_component / 45) * 0.15 + discharge_component * 0.3)


def stable_unit(value: str) -> float:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) / 0xFFFFFFFF


def feature_center(feature: dict) -> tuple[float, float]:
    coords: list[tuple[float, float]] = []

    def collect(node: object) -> None:
        if isinstance(node, list) and len(node) >= 2 and all(isinstance(item, (int, float)) for item in node[:2]):
            coords.append((float(node[0]), float(node[1])))
        elif isinstance(node, list):
            for child in node:
                collect(child)

    collect(feature.get("geometry", {}).get("coordinates", []))
    if not coords:
        return 0.0, 0.0
    lon = sum(item[0] for item in coords) / len(coords)
    lat = sum(item[1] for item in coords) / len(coords)
    return lat, lon


def load_cadasters(cadasters_geojson: Path) -> list[dict]:
    data = json.loads(cadasters_geojson.read_text(encoding="utf-8"))
    rows = []
    for feature in data.get("features", []):
        properties = feature.get("properties", {})
        acs_code = normalize_acs_code(properties.get("ACS_Code") or properties.get("region_id"))
        name = properties.get("Muni") or properties.get("region_name") or properties.get("District") or f"Cadaster {acs_code}"
        lat, lon = feature_center(feature)
        rows.append({"ACS_Code": acs_code, "region_name": str(name), "latitude": lat, "longitude": lon})
    return rows


def read_optional_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path)


def observed_records(cadasters: list[dict], weather_csv: Path, flood_csv: Path) -> dict[str, list[dict]]:
    weather = read_optional_csv(weather_csv)
    flood = read_optional_csv(flood_csv)
    if weather.empty:
        return {}

    weather["ACS_Code"] = weather["ACS_Code"].map(normalize_acs_code)
    weather["date_time"] = pd.to_datetime(weather["date_time"])
    soil_columns = [column for column in weather.columns if column.startswith("soil_moisture")]
    weather["soil_moisture_mean"] = weather[soil_columns].mean(axis=1) if soil_columns else pd.NA

    flood_lookup: dict[str, float] = {}
    if not flood.empty and {"ACS_Code", "river_discharge"}.issubset(flood.columns):
        flood["ACS_Code"] = flood["ACS_Code"].map(normalize_acs_code)
        if "river_discharge_mean" not in flood.columns:
            flood["river_discharge_mean"] = flood.groupby("ACS_Code")["river_discharge"].transform("mean")
        for acs_code, group in flood.groupby("ACS_Code"):
            normal = float(group["river_discharge_mean"].mean())
            flood_lookup[acs_code] = float(group["river_discharge"].max()) / normal if normal > 0 else 0.0

    names = {item["ACS_Code"]: item["region_name"] for item in cadasters}
    records: dict[str, list[dict]] = {}
    for acs_code, group in weather.groupby("ACS_Code"):
        monthly_rows = []
        for month, monthly in group.groupby(group["date_time"].dt.strftime("%Y-%m")):
            rainfall = float(monthly["precipitation"].sum())
            rainfall_7d = rainfall / max(monthly["date_time"].dt.date.nunique(), 1) * 7
            humidity = float(monthly["relative_humidity_2m"].mean())
            soil = float(monthly["soil_moisture_mean"].mean()) if monthly["soil_moisture_mean"].notna().any() else None
            discharge_ratio = flood_lookup.get(acs_code)
            score = score_risk(rainfall_7d, humidity, soil, discharge_ratio)
            monthly_rows.append(
                {
                    "ACS_Code": acs_code,
                    "region_name": names.get(acs_code, f"Cadaster {acs_code}"),
                    "month": month,
                    "rainfall_mm": round(rainfall, 2),
                    "avg_humidity": round(humidity, 2),
                    "river_discharge": round(discharge_ratio or 0, 3),
                    "average_risk_score": round(score, 3),
                    "risk_label": risk_label(score),
                    "data_status": "observed",
                }
            )
        if monthly_rows:
            records[acs_code] = monthly_rows
    return records


def estimated_records(cadaster: dict) -> list[dict]:
    acs_code = cadaster["ACS_Code"]
    lat = float(cadaster["latitude"])
    lon = float(cadaster["longitude"])
    coastal_pressure = max(0.0, min(1.0, (36.7 - lon) / 2.0))
    north_pressure = max(0.0, min(1.0, (lat - 33.0) / 2.0))
    local_noise = stable_unit(acs_code)
    base_rainfall = 42 + coastal_pressure * 18 + north_pressure * 11 + local_noise * 16
    base_humidity = 67 + coastal_pressure * 12 + local_noise * 8
    base_soil = 0.16 + coastal_pressure * 0.09 + local_noise * 0.11
    base_discharge = 0.55 + north_pressure * 0.28 + coastal_pressure * 0.34 + local_noise * 0.38
    month_weights = {
        "2025-11": 0.72,
        "2025-12": 1.02,
        "2026-01": 1.3,
        "2026-02": 1.12,
        "2026-03": 0.84,
    }

    rows = []
    for month in RAINY_MONTHS:
        weight = month_weights[month]
        rainfall = base_rainfall * weight
        discharge_ratio = base_discharge * (0.82 + weight * 0.18)
        score = score_risk(rainfall / 30 * 7, base_humidity, base_soil, discharge_ratio)
        rows.append(
            {
                "ACS_Code": acs_code,
                "region_name": cadaster["region_name"],
                "month": month,
                "rainfall_mm": round(rainfall, 2),
                "avg_humidity": round(base_humidity, 2),
                "river_discharge": round(discharge_ratio, 3),
                "average_risk_score": round(score, 3),
                "risk_label": risk_label(score),
                "data_status": "estimated",
            }
        )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Build all-cadaster rainy-season flood risk records.")
    parser.add_argument("--cadasters-geojson", type=Path, default=DEFAULT_CADASTERS)
    parser.add_argument("--weather-input", type=Path, default=DEFAULT_WEATHER_INPUT)
    parser.add_argument("--flood-input", type=Path, default=DEFAULT_FLOOD_INPUT)
    args = parser.parse_args()

    cadasters = list({item["ACS_Code"]: item for item in load_cadasters(args.cadasters_geojson)}.values())
    observed = observed_records(cadasters, args.weather_input, args.flood_input)
    rows = []
    for cadaster in cadasters:
        rows.extend(observed.get(cadaster["ACS_Code"], estimated_records(cadaster)))

    PREDICTIONS_DIR.mkdir(parents=True, exist_ok=True)
    FRONTEND_DATA_DIR.mkdir(parents=True, exist_ok=True)
    frame = pd.DataFrame(rows)
    frame.to_csv(PREDICTIONS_DIR / "rainy_season_history.csv", index=False)
    json_text = frame.to_json(orient="records", indent=2)
    (PREDICTIONS_DIR / "rainy_season_history.json").write_text(json_text, encoding="utf-8")
    (FRONTEND_DATA_DIR / "rainy_season_history.json").write_text(json_text, encoding="utf-8")
    observed_count = sum(1 for items in observed.values() if items)
    print(f"Wrote rainy-season risk for {len(cadasters)} cadasters ({observed_count} observed, {len(cadasters) - observed_count} estimated)")


if __name__ == "__main__":
    main()
