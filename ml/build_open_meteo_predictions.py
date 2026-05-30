from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "data" / "raw" / "open_meteo" / "cadaster_weather_forecast.csv"
DEFAULT_FLOOD_INPUT = ROOT / "data" / "raw" / "open_meteo" / "cadaster_flood_forecast.csv"
DEFAULT_CADASTERS = ROOT / "data" / "geo" / "cadasters.geojson"
PREDICTIONS_DIR = ROOT / "data" / "predictions"
FRONTEND_DATA_DIR = ROOT / "frontend" / "src" / "data"


def normalize_acs_code(value: object) -> str:
    try:
        number = float(value)
        if number.is_integer():
            return str(int(number))
    except (TypeError, ValueError):
        pass
    return str(value)


def risk_from_weather(row: pd.Series) -> tuple[str, float, str, str]:
    rainfall = row["rainfall_7d"]
    humidity = row["humidity_avg_7d"]
    soil_moisture = row.get("soil_moisture_avg_7d")
    discharge_ratio = row.get("river_discharge_ratio")
    if rainfall <= 0:
        return "Low", 0.0, "No rain over the last 7 days", "No flood-risk action is needed from rainfall-driven conditions."

    soil_component = 0 if pd.isna(soil_moisture) else min(float(soil_moisture) * 100, 45)
    discharge_component = 0 if pd.isna(discharge_ratio) else min(float(discharge_ratio), 2.0) / 2.0
    score = min(1.0, (rainfall / 80) * 0.38 + (humidity / 100) * 0.17 + (soil_component / 45) * 0.15 + discharge_component * 0.3)

    if rainfall >= 60 or (not pd.isna(discharge_ratio) and discharge_ratio >= 1.35) or score >= 0.72:
        label = "High"
        action = "Prioritize drainage inspection, field monitoring, and public advisory preparation."
    elif rainfall >= 25 or (not pd.isna(discharge_ratio) and discharge_ratio >= 0.85) or score >= 0.45:
        label = "Medium"
        action = "Monitor low-lying roads and keep drainage crews on standby."
    else:
        label = "Low"
        action = "Continue routine monitoring and review rainfall trend updates."

    drivers = []
    if rainfall >= 60:
        drivers.append("Heavy rain over the last 7 days")
    elif rainfall >= 25:
        drivers.append("Moderate recent rainfall")
    else:
        drivers.append("Limited recent rainfall")
    if humidity >= 80:
        drivers.append("High humidity")
    if not pd.isna(soil_moisture):
        drivers.append("Soil moisture included")
    if not pd.isna(discharge_ratio):
        drivers.append(f"River flow is {discharge_ratio:.2f}x its normal level")

    return label, round(score, 2), "; ".join(drivers), action


def load_cadaster_names(cadasters_geojson: Path) -> dict[str, str]:
    if not cadasters_geojson.exists():
        return {}

    data = json.loads(cadasters_geojson.read_text(encoding="utf-8"))
    names: dict[str, str] = {}
    for feature in data.get("features", []):
        properties = feature.get("properties", {})
        acs_code = normalize_acs_code(properties.get("ACS_Code") or properties.get("region_id"))
        name = properties.get("Muni") or properties.get("region_name") or properties.get("District") or properties.get("GOV")
        if acs_code and name:
            names[acs_code] = str(name)
    return names


def load_flood_features(flood_csv: Path) -> pd.DataFrame:
    if not flood_csv.exists():
        return pd.DataFrame(columns=["ACS_Code", "river_discharge_max_7d", "river_discharge_mean_7d", "river_discharge_ratio"])

    flood = pd.read_csv(flood_csv)
    required = {"ACS_Code", "date", "river_discharge"}
    missing = required.difference(flood.columns)
    if missing:
        raise ValueError(f"Open-Meteo flood CSV is missing required columns: {', '.join(sorted(missing))}")

    flood["ACS_Code"] = flood["ACS_Code"].map(normalize_acs_code)
    if "river_discharge_mean" not in flood.columns:
        flood["river_discharge_mean"] = flood.groupby("ACS_Code")["river_discharge"].transform("mean")

    rows = []
    for acs_code, group in flood.groupby("ACS_Code"):
        latest = group.tail(7)
        discharge_max = float(latest["river_discharge"].max())
        discharge_mean = float(latest["river_discharge_mean"].mean())
        rows.append(
            {
                "ACS_Code": acs_code,
                "river_discharge_max_7d": round(discharge_max, 3),
                "river_discharge_mean_7d": round(discharge_mean, 3),
                "river_discharge_ratio": round(discharge_max / discharge_mean, 3) if discharge_mean > 0 else None,
            }
        )
    return pd.DataFrame(rows)


def build_predictions(input_csv: Path, cadasters_geojson: Path, flood_csv: Path) -> pd.DataFrame:
    if not input_csv.exists():
        raise FileNotFoundError(f"Open-Meteo cadaster weather CSV not found: {input_csv}")

    cadaster_names = load_cadaster_names(cadasters_geojson)
    weather = pd.read_csv(input_csv)
    required = {"ACS_Code", "latitude", "longitude", "date_time", "precipitation", "relative_humidity_2m", "temperature_2m", "wind_speed_10m"}
    missing = required.difference(weather.columns)
    if missing:
        raise ValueError(f"Open-Meteo weather CSV is missing required columns: {', '.join(sorted(missing))}")

    weather["ACS_Code"] = weather["ACS_Code"].map(normalize_acs_code)
    flood_features = load_flood_features(flood_csv)
    weather["date_time"] = pd.to_datetime(weather["date_time"])
    weather = weather.sort_values(["ACS_Code", "date_time"])
    soil_columns = [column for column in weather.columns if column.startswith("soil_moisture")]
    if soil_columns:
        weather["soil_moisture_mean"] = weather[soil_columns].mean(axis=1)
    else:
        weather["soil_moisture_mean"] = pd.NA

    rows = []
    for acs_code, group in weather.groupby("ACS_Code"):
        flood_match = flood_features[flood_features["ACS_Code"] == acs_code]
        flood_row = flood_match.iloc[0].to_dict() if not flood_match.empty else {}
        latest = group.tail(168)
        last_24h = group.tail(24)
        update_date = group["date_time"].min().strftime("%Y-%m-%d")
        row = {
            "region_id": acs_code,
            "region_name": cadaster_names.get(acs_code, f"Cadaster {acs_code}"),
            "date": update_date,
            "latitude": round(float(group["latitude"].iloc[-1]), 6),
            "longitude": round(float(group["longitude"].iloc[-1]), 6),
            "rainfall_1d": round(float(last_24h["precipitation"].sum()), 2),
            "rainfall_3d": round(float(group.tail(72)["precipitation"].sum()), 2),
            "rainfall_7d": round(float(latest["precipitation"].sum()), 2),
            "rainfall_14d": round(float(group.tail(336)["precipitation"].sum()), 2),
            "humidity_avg_3d": round(float(group.tail(72)["relative_humidity_2m"].mean()), 2),
            "humidity_avg_7d": round(float(latest["relative_humidity_2m"].mean()), 2),
            "temperature_avg_7d": round(float(latest["temperature_2m"].mean()), 2),
            "wind_avg_7d": round(float(latest["wind_speed_10m"].mean()), 2),
            "elevation_mean": 0,
            "slope_mean": 0,
            "distance_to_river_km": 0,
            "soil_moisture_avg_7d": round(float(latest["soil_moisture_mean"].mean()), 3) if latest["soil_moisture_mean"].notna().any() else None,
            "river_discharge_max_7d": flood_row.get("river_discharge_max_7d"),
            "river_discharge_mean_7d": flood_row.get("river_discharge_mean_7d"),
            "river_discharge_ratio": flood_row.get("river_discharge_ratio"),
        }
        label, score, drivers, action = risk_from_weather(pd.Series(row))
        row["risk_label"] = label
        row["risk_score"] = score
        row["main_drivers"] = drivers
        row["recommended_action"] = action
        rows.append(row)

    return pd.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build dashboard risk predictions from Open-Meteo cadaster weather CSV.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--flood-input", type=Path, default=DEFAULT_FLOOD_INPUT)
    parser.add_argument("--cadasters-geojson", type=Path, default=DEFAULT_CADASTERS)
    args = parser.parse_args()

    predictions = build_predictions(args.input, args.cadasters_geojson, args.flood_input)
    PREDICTIONS_DIR.mkdir(parents=True, exist_ok=True)
    FRONTEND_DATA_DIR.mkdir(parents=True, exist_ok=True)
    csv_output = PREDICTIONS_DIR / "risk_predictions.csv"
    json_output = PREDICTIONS_DIR / "risk_predictions.json"
    frontend_output = FRONTEND_DATA_DIR / "risk_predictions.json"
    predictions.to_csv(csv_output, index=False)
    json_text = predictions.to_json(orient="records", indent=2)
    json_output.write_text(json_text, encoding="utf-8")
    frontend_output.write_text(json_text, encoding="utf-8")
    print(f"Wrote {len(predictions)} Open-Meteo cadaster predictions")


if __name__ == "__main__":
    main()
