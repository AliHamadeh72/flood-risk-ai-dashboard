from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
import requests
from tqdm import tqdm


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CADASTERS_DIR = Path(r"C:\Users\Mohammad Mahdi\Documents\Cadasters")
OUTPUT_DIR = ROOT / "data" / "raw" / "open_meteo"
CACHE_DIR = ROOT / "data" / "raw" / "open_meteo_cache"

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

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


class PipelineError(RuntimeError):
    """Raised for expected pipeline validation and API failures."""


def find_shapefile(cadasters_dir: Path) -> Path:
    if not cadasters_dir.exists():
        raise PipelineError(f"Cadaster folder is missing: {cadasters_dir}")

    shapefiles = sorted(cadasters_dir.rglob("*.shp"))
    if not shapefiles:
        raise PipelineError(f"No shapefile found under: {cadasters_dir}")

    preferred = [path for path in shapefiles if path.stem.lower() == "cadasters"]
    return preferred[0] if preferred else shapefiles[0]


def read_cadasters(shapefile: Path) -> gpd.GeoDataFrame:
    cadasters = gpd.read_file(shapefile)
    if "ACS_Code" not in cadasters.columns:
        raise PipelineError(f"ACS_Code field is missing from shapefile: {shapefile}")
    if cadasters.empty:
        raise PipelineError(f"Shapefile contains no cadaster records: {shapefile}")
    if cadasters.crs is None:
        raise PipelineError("Shapefile CRS is missing; define the source CRS before running the pipeline.")

    cadasters = cadasters.to_crs(epsg=4326)
    cadasters = cadasters[~cadasters.geometry.is_empty & cadasters.geometry.notna()].copy()
    if cadasters.empty:
        raise PipelineError("No valid cadaster geometries were found after filtering empty geometries.")

    points = cadasters.geometry.representative_point()
    cadasters["latitude"] = points.y
    cadasters["longitude"] = points.x
    return cadasters


def cache_key(params: dict[str, Any]) -> str:
    payload = json.dumps(params, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def request_open_meteo(url: str, params: dict[str, Any], cache_dir: Path) -> dict[str, Any]:
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = cache_key({"url": url, "params": params})
    cache_file = cache_dir / f"{key}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))

    try:
        response = requests.get(url, params=params, timeout=45)
    except requests.RequestException as exc:
        raise PipelineError(f"Open-Meteo request could not be completed: {exc}") from exc
    if response.status_code >= 400:
        raise PipelineError(f"Open-Meteo request failed ({response.status_code}): {response.text[:500]}")

    payload = response.json()
    if "error" in payload:
        raise PipelineError(f"Open-Meteo returned an error: {payload.get('reason', payload)}")

    cache_file.write_text(json.dumps(payload), encoding="utf-8")
    return payload


def build_params(
    mode: str,
    latitude: float,
    longitude: float,
    start_date: str | None,
    end_date: str | None,
    include_soil_moisture: bool,
) -> tuple[str, dict[str, Any]]:
    hourly = BASE_HOURLY_VARIABLES + (SOIL_MOISTURE_VARIABLES if include_soil_moisture else [])
    params: dict[str, Any] = {
        "latitude": round(latitude, 6),
        "longitude": round(longitude, 6),
        "hourly": ",".join(hourly),
        "timezone": "auto",
    }

    if mode == "forecast":
        params["forecast_days"] = 7
        return FORECAST_URL, params

    if not start_date or not end_date:
        raise PipelineError("Historical mode requires --start-date and --end-date in YYYY-MM-DD format.")
    params["start_date"] = start_date
    params["end_date"] = end_date
    return ARCHIVE_URL, params


def payload_to_rows(acs_code: str, latitude: float, longitude: float, payload: dict[str, Any]) -> list[dict[str, Any]]:
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


def fetch_cadaster_weather(
    cadasters: gpd.GeoDataFrame,
    mode: str,
    start_date: str | None,
    end_date: str | None,
    include_soil_moisture: bool,
    rate_limit_seconds: float,
    limit: int | None,
) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    selected = cadasters.head(limit) if limit else cadasters

    for record in tqdm(selected.itertuples(index=False), total=len(selected), desc=f"Open-Meteo {mode}"):
        acs_code = str(getattr(record, "ACS_Code"))
        latitude = float(getattr(record, "latitude"))
        longitude = float(getattr(record, "longitude"))
        url, params = build_params(mode, latitude, longitude, start_date, end_date, include_soil_moisture)

        try:
            payload = request_open_meteo(url, params, CACHE_DIR)
        except PipelineError as exc:
            if include_soil_moisture and "soil_moisture" in str(exc):
                url, params = build_params(mode, latitude, longitude, start_date, end_date, include_soil_moisture=False)
                payload = request_open_meteo(url, params, CACHE_DIR)
            else:
                raise PipelineError(f"API request failed for ACS_Code={acs_code}: {exc}") from exc

        rows.extend(payload_to_rows(acs_code, latitude, longitude, payload))
        if rate_limit_seconds > 0:
            time.sleep(rate_limit_seconds)

    return pd.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Open-Meteo weather data for Lebanon cadasters.")
    parser.add_argument("--cadasters-dir", type=Path, default=DEFAULT_CADASTERS_DIR, help="Folder containing the cadaster shapefile.")
    parser.add_argument("--mode", choices=["forecast", "historical"], default="forecast", help="Open-Meteo endpoint mode.")
    parser.add_argument("--start-date", help="Historical start date in YYYY-MM-DD format.")
    parser.add_argument("--end-date", help="Historical end date in YYYY-MM-DD format.")
    parser.add_argument("--rate-limit-seconds", type=float, default=0.25, help="Delay between uncached cadaster requests.")
    parser.add_argument("--limit", type=int, help="Optional number of cadasters to process for testing.")
    parser.add_argument("--no-soil-moisture", action="store_true", help="Skip soil moisture variables.")
    parser.add_argument("--output", type=Path, help="Output CSV path.")
    args = parser.parse_args()

    try:
        shapefile = find_shapefile(args.cadasters_dir)
        cadasters = read_cadasters(shapefile)
        weather = fetch_cadaster_weather(
            cadasters=cadasters,
            mode=args.mode,
            start_date=args.start_date,
            end_date=args.end_date,
            include_soil_moisture=not args.no_soil_moisture,
            rate_limit_seconds=args.rate_limit_seconds,
            limit=args.limit,
        )
    except PipelineError as exc:
        raise SystemExit(f"ERROR: {exc}") from exc

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output = args.output or OUTPUT_DIR / f"cadaster_weather_{args.mode}.csv"
    weather.to_csv(output, index=False)
    print(f"Wrote {output} with {len(weather)} weather rows from {weather['ACS_Code'].nunique()} cadasters")


if __name__ == "__main__":
    main()
