from __future__ import annotations

import argparse
import time
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
from tqdm import tqdm

from fetch_open_meteo_cadasters import (
    CACHE_DIR,
    DEFAULT_CADASTERS_DIR,
    OUTPUT_DIR,
    PipelineError,
    find_shapefile,
    normalize_acs_code,
    read_cadasters,
    request_open_meteo,
)


FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"
DAILY_VARIABLES = [
    "river_discharge",
    "river_discharge_mean",
    "river_discharge_max",
    "river_discharge_p75",
]


def build_params(latitude: float, longitude: float, forecast_days: int, past_days: int, start_date: str | None, end_date: str | None) -> dict[str, Any]:
    params: dict[str, Any] = {
        "latitude": round(latitude, 6),
        "longitude": round(longitude, 6),
        "daily": ",".join(DAILY_VARIABLES),
        "timezone": "auto",
    }
    if start_date and end_date:
        params["start_date"] = start_date
        params["end_date"] = end_date
    else:
        params["forecast_days"] = forecast_days
        if past_days:
            params["past_days"] = past_days
    return params


def payload_to_rows(acs_code: str, latitude: float, longitude: float, payload: dict[str, Any]) -> list[dict[str, Any]]:
    daily = payload.get("daily")
    if not daily or "time" not in daily:
        raise PipelineError(f"Open-Meteo Flood response for ACS_Code={acs_code} does not include daily time data.")
    if "river_discharge" not in daily:
        raise PipelineError(f"Open-Meteo Flood response for ACS_Code={acs_code} is missing river_discharge.")

    rows = []
    for index, date in enumerate(daily["time"]):
        row = {
            "ACS_Code": normalize_acs_code(acs_code),
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


def fetch_flood(cadasters: gpd.GeoDataFrame, forecast_days: int, past_days: int, start_date: str | None, end_date: str | None, rate_limit_seconds: float, limit: int | None) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    selected = cadasters.head(limit) if limit else cadasters

    for record in tqdm(selected.itertuples(index=False), total=len(selected), desc="Open-Meteo flood"):
        acs_code = str(getattr(record, "ACS_Code"))
        latitude = float(getattr(record, "latitude"))
        longitude = float(getattr(record, "longitude"))
        params = build_params(latitude, longitude, forecast_days, past_days, start_date, end_date)
        try:
            payload = request_open_meteo(FLOOD_URL, params, CACHE_DIR)
        except PipelineError as exc:
            raise PipelineError(f"Flood API request failed for ACS_Code={acs_code}: {exc}") from exc
        rows.extend(payload_to_rows(acs_code, latitude, longitude, payload))
        if rate_limit_seconds > 0:
            time.sleep(rate_limit_seconds)

    return pd.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Open-Meteo Flood API river discharge data for cadasters.")
    parser.add_argument("--cadasters-dir", type=Path, default=DEFAULT_CADASTERS_DIR)
    parser.add_argument("--forecast-days", type=int, default=7)
    parser.add_argument("--past-days", type=int, default=0)
    parser.add_argument("--start-date")
    parser.add_argument("--end-date")
    parser.add_argument("--rate-limit-seconds", type=float, default=0.25)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    try:
        cadasters = read_cadasters(find_shapefile(args.cadasters_dir))
        flood = fetch_flood(cadasters, args.forecast_days, args.past_days, args.start_date, args.end_date, args.rate_limit_seconds, args.limit)
    except PipelineError as exc:
        raise SystemExit(f"ERROR: {exc}") from exc

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output = args.output or OUTPUT_DIR / "cadaster_flood_forecast.csv"
    flood.to_csv(output, index=False)
    print(f"Wrote {output} with {len(flood)} flood rows from {flood['ACS_Code'].nunique()} cadasters")


if __name__ == "__main__":
    main()
