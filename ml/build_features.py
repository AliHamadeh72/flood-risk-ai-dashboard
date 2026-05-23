from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
STATIC_FILE = ROOT / "data" / "processed" / "region_static_features.csv"
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"


def risk_label(row: pd.Series) -> str:
    rainfall_pressure = row["rainfall_7d"] + 0.35 * row["rainfall_14d"]
    terrain_pressure = 0
    terrain_pressure += 20 if row["elevation_mean"] < 50 else 5 if row["elevation_mean"] < 250 else 0
    terrain_pressure += 18 if row["slope_mean"] < 2.5 else 6 if row["slope_mean"] < 6 else 0
    terrain_pressure += 12 if row["distance_to_river_km"] < 0.8 else 5 if row["distance_to_river_km"] < 1.8 else 0
    score = rainfall_pressure + terrain_pressure
    if score >= 105:
        return "High"
    if score >= 65:
        return "Medium"
    return "Low"


def synthetic_weather(static: pd.DataFrame) -> pd.DataFrame:
    dates = pd.date_range(end="2026-05-23", periods=220)
    rows = []
    rng = np.random.default_rng(42)
    for region in static.itertuples(index=False):
        coastal_factor = max(0, 1 - region.elevation_mean / 1000)
        for date in dates:
            seasonal = 12 + 11 * np.cos((date.dayofyear - 20) / 365 * 2 * np.pi)
            rain = max(0, rng.gamma(1.6, 4.2) * coastal_factor + seasonal * rng.random() * 0.45 - 4)
            rows.append(
                {
                    "date": date.strftime("%Y%m%d"),
                    "PRECTOTCORR": round(rain, 2),
                    "RH2M": round(58 + rain * 1.3 + coastal_factor * 8 + rng.normal(0, 4), 2),
                    "T2M": round(16 + (1 - coastal_factor) * -3 + rng.normal(0, 3), 2),
                    "WS10M": round(max(0.7, 3.5 + rng.normal(0, 1.0)), 2),
                    "region_id": region.region_id,
                    "region_name": region.region_name,
                }
            )
    return pd.DataFrame(rows)


def latest_raw_file() -> Path | None:
    files = sorted(RAW_DIR.glob("nasa_power_*.csv"))
    return files[-1] if files else None


def build_features() -> pd.DataFrame:
    static = pd.read_csv(STATIC_FILE)
    raw_file = latest_raw_file()
    weather = pd.read_csv(raw_file) if raw_file else synthetic_weather(static)
    weather["date"] = pd.to_datetime(weather["date"].astype(str), format="%Y%m%d")
    weather = weather.sort_values(["region_id", "date"])
    weather = weather.rename(
        columns={
            "PRECTOTCORR": "rainfall_1d",
            "RH2M": "humidity",
            "T2M": "temperature",
            "WS10M": "wind",
        }
    )

    grouped = weather.groupby("region_id", group_keys=False)
    weather["rainfall_3d"] = grouped["rainfall_1d"].rolling(3, min_periods=1).sum().reset_index(level=0, drop=True)
    weather["rainfall_7d"] = grouped["rainfall_1d"].rolling(7, min_periods=1).sum().reset_index(level=0, drop=True)
    weather["rainfall_14d"] = grouped["rainfall_1d"].rolling(14, min_periods=1).sum().reset_index(level=0, drop=True)
    weather["humidity_avg_3d"] = grouped["humidity"].rolling(3, min_periods=1).mean().reset_index(level=0, drop=True)
    weather["humidity_avg_7d"] = grouped["humidity"].rolling(7, min_periods=1).mean().reset_index(level=0, drop=True)
    weather["temperature_avg_7d"] = grouped["temperature"].rolling(7, min_periods=1).mean().reset_index(level=0, drop=True)
    weather["wind_avg_7d"] = grouped["wind"].rolling(7, min_periods=1).mean().reset_index(level=0, drop=True)

    features = weather.merge(static, on=["region_id", "region_name"], how="left")
    features["risk_label"] = features.apply(risk_label, axis=1)
    features["date"] = features["date"].dt.strftime("%Y-%m-%d")

    columns = [
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
        "elevation_min",
        "elevation_max",
        "slope_mean",
        "distance_to_river_km",
        "population_density",
        "risk_label",
    ]
    return features[columns]


def main() -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    features = build_features()
    output = PROCESSED_DIR / "features.csv"
    features.to_csv(output, index=False)
    print(f"Wrote {output} with {len(features)} rows")


if __name__ == "__main__":
    main()
