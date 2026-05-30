from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.append(str(SCRIPT_DIR))

from build_open_meteo_predictions import build_predictions


class PipelineError(RuntimeError):
    """Raised for expected refresh validation and API failures."""


ROOT = SCRIPT_DIR.parents[0]
DEFAULT_CADASTERS_GEOJSON = ROOT / "data" / "geo" / "cadasters.geojson"
OUTPUT_DIR = ROOT / "data" / "raw" / "open_meteo"
CACHE_DIR = ROOT / "data" / "raw" / "open_meteo_cache"
PREDICTIONS_DIR = ROOT / "data" / "predictions"
FRONTEND_DATA_DIR = ROOT / "frontend" / "src" / "data"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"
BASE_HOURLY_VARIABLES = [
    "precipitation",
    "relative_humidity_2m",
    "temperature_2m",
    "wind_speed_10m",
]
SOIL_MOISTURE_VARIABLES = [
    "soil_moisture_0_to_1cm",
    "soil_moisture_1_to_3cm",
    "soil_moisture_3_to_9cm",
]
FLOOD_DAILY_VARIABLES = [
    "river_discharge",
    "river_discharge_mean",
    "river_discharge_max",
    "river_discharge_p75",
]


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


def read_cadasters_geojson(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise PipelineError(f"Cadaster GeoJSON is missing: {path}")

    data = json.loads(path.read_text(encoding="utf-8"))
    rows = []
    for feature in data.get("features", []):
        properties = feature.get("properties", {})
        acs_code = properties.get("ACS_Code") or properties.get("region_id")
        if not acs_code:
            continue
        latitude, longitude = feature_center(feature)
        rows.append(
            {
                "ACS_Code": str(acs_code),
                "latitude": latitude,
                "longitude": longitude,
            }
        )

    cadasters = pd.DataFrame(rows)
    if cadasters.empty:
        raise PipelineError(f"Cadaster GeoJSON contains no records: {path}")
    return cadasters


def cache_key(url: str, params: dict[str, Any]) -> str:
    payload = json.dumps({"url": url, "params": params}, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def request_open_meteo(url: str, params: dict[str, Any]) -> dict[str, Any]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"{cache_key(url, params)}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))

    request_url = f"{url}?{urlencode(params)}"
    try:
        with urlopen(request_url, timeout=45) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise PipelineError(f"Open-Meteo request failed ({exc.code}): {body[:500]}") from exc
    except URLError as exc:
        raise PipelineError(f"Open-Meteo request could not be completed: {exc}") from exc
    if "error" in payload:
        raise PipelineError(f"Open-Meteo returned an error: {payload.get('reason', payload)}")

    cache_file.write_text(json.dumps(payload), encoding="utf-8")
    return payload


def weather_params(latitude: float, longitude: float, include_soil_moisture: bool) -> dict[str, Any]:
    hourly = BASE_HOURLY_VARIABLES + (SOIL_MOISTURE_VARIABLES if include_soil_moisture else [])
    return {
        "latitude": round(latitude, 6),
        "longitude": round(longitude, 6),
        "hourly": ",".join(hourly),
        "timezone": "auto",
        "forecast_days": 7,
    }


def flood_params(latitude: float, longitude: float, forecast_days: int, past_days: int) -> dict[str, Any]:
    params: dict[str, Any] = {
        "latitude": round(latitude, 6),
        "longitude": round(longitude, 6),
        "daily": ",".join(FLOOD_DAILY_VARIABLES),
        "timezone": "auto",
        "forecast_days": forecast_days,
    }
    if past_days:
        params["past_days"] = past_days
    return params


def weather_payload_to_rows(acs_code: str, latitude: float, longitude: float, payload: dict[str, Any]) -> list[dict[str, Any]]:
    hourly = payload.get("hourly")
    if not hourly or "time" not in hourly:
        raise PipelineError(f"Open-Meteo response for ACS_Code={acs_code} does not include hourly time data.")

    missing = [name for name in BASE_HOURLY_VARIABLES if name not in hourly]
    if missing:
        raise PipelineError(f"Required Open-Meteo variables unavailable for ACS_Code={acs_code}: {', '.join(missing)}")

    rows = []
    for index, timestamp in enumerate(hourly["time"]):
        row = {
            "ACS_Code": acs_code,
            "latitude": latitude,
            "longitude": longitude,
            "date_time": timestamp,
        }
        for variable, values in hourly.items():
            if variable == "time":
                continue
            row[variable] = values[index] if index < len(values) else None
        rows.append(row)
    return rows


def flood_payload_to_rows(acs_code: str, latitude: float, longitude: float, payload: dict[str, Any]) -> list[dict[str, Any]]:
    daily = payload.get("daily")
    if not daily or "time" not in daily:
        raise PipelineError(f"Open-Meteo Flood response for ACS_Code={acs_code} does not include daily time data.")
    if "river_discharge" not in daily:
        raise PipelineError(f"Open-Meteo Flood response for ACS_Code={acs_code} is missing river_discharge.")

    rows = []
    for index, date in enumerate(daily["time"]):
        row = {
            "ACS_Code": acs_code,
            "latitude": latitude,
            "longitude": longitude,
            "date": date,
        }
        for variable, values in daily.items():
            if variable == "time":
                continue
            row[variable] = values[index] if index < len(values) else None
        rows.append(row)
    return rows


def fetch_weather(cadasters: pd.DataFrame, include_soil_moisture: bool, rate_limit_seconds: float, limit: int | None) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    selected = cadasters.head(limit) if limit else cadasters

    for record in selected.itertuples(index=False):
        acs_code = str(getattr(record, "ACS_Code"))
        latitude = float(getattr(record, "latitude"))
        longitude = float(getattr(record, "longitude"))
        params = weather_params(latitude, longitude, include_soil_moisture)
        try:
            payload = request_open_meteo(FORECAST_URL, params)
        except PipelineError as exc:
            if include_soil_moisture and "soil_moisture" in str(exc):
                payload = request_open_meteo(FORECAST_URL, weather_params(latitude, longitude, False))
            else:
                raise PipelineError(f"Weather API request failed for ACS_Code={acs_code}: {exc}") from exc
        rows.extend(weather_payload_to_rows(acs_code, latitude, longitude, payload))
        if rate_limit_seconds > 0:
            time.sleep(rate_limit_seconds)

    return pd.DataFrame(rows)


def fetch_flood(cadasters: pd.DataFrame, forecast_days: int, past_days: int, rate_limit_seconds: float, limit: int | None) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    selected = cadasters.head(limit) if limit else cadasters

    for record in selected.itertuples(index=False):
        acs_code = str(getattr(record, "ACS_Code"))
        latitude = float(getattr(record, "latitude"))
        longitude = float(getattr(record, "longitude"))
        payload = request_open_meteo(FLOOD_URL, flood_params(latitude, longitude, forecast_days, past_days))
        rows.extend(flood_payload_to_rows(acs_code, latitude, longitude, payload))
        if rate_limit_seconds > 0:
            time.sleep(rate_limit_seconds)

    return pd.DataFrame(rows)


def export_predictions(weather_csv: Path, flood_csv: Path, cadasters_geojson: Path) -> None:
    predictions = build_predictions(weather_csv, cadasters_geojson, flood_csv)
    PREDICTIONS_DIR.mkdir(parents=True, exist_ok=True)
    FRONTEND_DATA_DIR.mkdir(parents=True, exist_ok=True)

    predictions.to_csv(PREDICTIONS_DIR / "risk_predictions.csv", index=False)
    json_text = predictions.to_json(orient="records", indent=2)
    (PREDICTIONS_DIR / "risk_predictions.json").write_text(json_text, encoding="utf-8")
    (FRONTEND_DATA_DIR / "risk_predictions.json").write_text(json_text, encoding="utf-8")
    print(f"Wrote {len(predictions)} refreshed cadaster predictions")


def main() -> None:
    parser = argparse.ArgumentParser(description="Refresh Open-Meteo weather, flood, and risk data for every cadaster.")
    parser.add_argument("--cadasters-geojson", type=Path, default=DEFAULT_CADASTERS_GEOJSON)
    parser.add_argument("--forecast-days", type=int, default=7)
    parser.add_argument("--past-days", type=int, default=0)
    parser.add_argument("--rate-limit-seconds", type=float, default=0.25)
    parser.add_argument("--limit", type=int, help="Optional cadaster limit for smoke tests or staged refreshes.")
    parser.add_argument("--no-soil-moisture", action="store_true", help="Skip Open-Meteo soil moisture variables.")
    args = parser.parse_args()

    try:
        cadasters = read_cadasters_geojson(args.cadasters_geojson)
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        weather_csv = OUTPUT_DIR / "cadaster_weather_forecast.csv"
        flood_csv = OUTPUT_DIR / "cadaster_flood_forecast.csv"

        weather = fetch_weather(
            cadasters=cadasters,
            include_soil_moisture=not args.no_soil_moisture,
            rate_limit_seconds=args.rate_limit_seconds,
            limit=args.limit,
        )
        weather.to_csv(weather_csv, index=False)
        print(f"Wrote {weather_csv} with {len(weather)} weather rows from {weather['ACS_Code'].nunique()} cadasters")

        flood = fetch_flood(
            cadasters=cadasters,
            forecast_days=args.forecast_days,
            past_days=args.past_days,
            rate_limit_seconds=args.rate_limit_seconds,
            limit=args.limit,
        )
        flood.to_csv(flood_csv, index=False)
        print(f"Wrote {flood_csv} with {len(flood)} flood rows from {flood['ACS_Code'].nunique()} cadasters")

        export_predictions(weather_csv, flood_csv, args.cadasters_geojson)
        subprocess.run(
            [
                sys.executable,
                str(ROOT / "ml" / "build_rainy_season_risk.py"),
                "--cadasters-geojson",
                str(args.cadasters_geojson),
            ],
            check=True,
        )
    except PipelineError as exc:
        raise SystemExit(f"ERROR: {exc}") from exc


if __name__ == "__main__":
    main()
