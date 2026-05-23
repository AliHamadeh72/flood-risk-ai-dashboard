from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
import requests


BASE_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAMETERS = "PRECTOTCORR,RH2M,T2M,WS10M"
ROOT = Path(__file__).resolve().parents[1]
REGIONS_FILE = ROOT / "data" / "processed" / "region_static_features.csv"
RAW_DIR = ROOT / "data" / "raw"


def fetch_region(latitude: float, longitude: float, start: str, end: str) -> pd.DataFrame:
    params = {
        "parameters": PARAMETERS,
        "community": "RE",
        "longitude": longitude,
        "latitude": latitude,
        "start": start,
        "end": end,
        "format": "JSON",
    }
    response = requests.get(BASE_URL, params=params, timeout=30)
    response.raise_for_status()
    data = response.json()["properties"]["parameter"]
    frame = pd.DataFrame(data)
    frame.index.name = "date"
    return frame.reset_index()


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch daily NASA POWER weather data for configured regions.")
    parser.add_argument("--start", required=True, help="Start date in YYYYMMDD format")
    parser.add_argument("--end", required=True, help="End date in YYYYMMDD format")
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    regions = pd.read_csv(REGIONS_FILE)

    all_rows = []
    for region in regions.itertuples(index=False):
        weather = fetch_region(region.latitude, region.longitude, args.start, args.end)
        weather["region_id"] = region.region_id
        weather["region_name"] = region.region_name
        all_rows.append(weather)

    combined = pd.concat(all_rows, ignore_index=True)
    output = RAW_DIR / f"nasa_power_{args.start}_{args.end}.csv"
    combined.to_csv(output, index=False)
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
