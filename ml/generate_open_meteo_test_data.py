from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
TEST_DIR = ROOT / "data" / "test"
FRONTEND_DATA_DIR = ROOT / "frontend" / "src" / "data"


SCENARIOS = [
    {
        "ACS_Code": "35237",
        "latitude": 34.62156,
        "longitude": 36.076919,
        "precipitation": 0.05,
        "humidity": 68,
        "temperature": 21,
        "wind": 8,
        "soil": 0.11,
        "river": 20,
        "river_mean": 30,
        "expected_risk": "Low",
    },
    {
        "ACS_Code": "35229",
        "latitude": 34.604,
        "longitude": 36.03,
        "precipitation": 0.18,
        "humidity": 82,
        "temperature": 20,
        "wind": 10,
        "soil": 0.24,
        "river": 32,
        "river_mean": 34,
        "expected_risk": "Medium",
    },
    {
        "ACS_Code": "35241",
        "latitude": 34.58,
        "longitude": 36.08,
        "precipitation": 0.42,
        "humidity": 91,
        "temperature": 19,
        "wind": 13,
        "soil": 0.36,
        "river": 58,
        "river_mean": 38,
        "expected_risk": "High",
    },
]


def main() -> None:
    TEST_DIR.mkdir(parents=True, exist_ok=True)
    FRONTEND_DATA_DIR.mkdir(parents=True, exist_ok=True)
    start = datetime(2026, 5, 24)
    weather_rows = []
    flood_rows = []
    expected_rows = []
    history_rows = []

    for scenario in SCENARIOS:
        for hour in range(168):
            timestamp = start + timedelta(hours=hour)
            weather_rows.append(
                {
                    "ACS_Code": scenario["ACS_Code"],
                    "latitude": scenario["latitude"],
                    "longitude": scenario["longitude"],
                    "date_time": timestamp.strftime("%Y-%m-%dT%H:%M"),
                    "precipitation": scenario["precipitation"],
                    "relative_humidity_2m": scenario["humidity"],
                    "temperature_2m": scenario["temperature"],
                    "wind_speed_10m": scenario["wind"],
                    "soil_moisture_0_to_1cm": scenario["soil"],
                    "soil_moisture_1_to_3cm": scenario["soil"],
                    "soil_moisture_3_to_9cm": scenario["soil"],
                }
            )
        for day in range(7):
            date = start + timedelta(days=day)
            flood_rows.append(
                {
                    "ACS_Code": scenario["ACS_Code"],
                    "latitude": scenario["latitude"],
                    "longitude": scenario["longitude"],
                    "date": date.strftime("%Y-%m-%d"),
                    "river_discharge": scenario["river"],
                    "river_discharge_mean": scenario["river_mean"],
                    "river_discharge_max": scenario["river"],
                    "river_discharge_p75": scenario["river_mean"] * 1.15,
                }
            )
        expected_rows.append({"ACS_Code": scenario["ACS_Code"], "expected_risk": scenario["expected_risk"]})

        rainy_months = [
            ("2025-11", scenario["precipitation"] * 24 * 8, scenario["river"] * 0.74),
            ("2025-12", scenario["precipitation"] * 24 * 13, scenario["river"] * 0.92),
            ("2026-01", scenario["precipitation"] * 24 * 18, scenario["river"] * 1.08),
            ("2026-02", scenario["precipitation"] * 24 * 16, scenario["river"] * 1.0),
            ("2026-03", scenario["precipitation"] * 24 * 11, scenario["river"] * 0.86),
        ]
        for month, rainfall, discharge in rainy_months:
            history_rows.append(
                {
                    "ACS_Code": scenario["ACS_Code"],
                    "month": month,
                    "rainfall_mm": round(rainfall, 2),
                    "avg_humidity": scenario["humidity"],
                    "river_discharge": round(discharge, 2),
                    "risk_label": scenario["expected_risk"],
                }
            )

    pd.DataFrame(weather_rows).to_csv(TEST_DIR / "open_meteo_weather_test.csv", index=False)
    pd.DataFrame(flood_rows).to_csv(TEST_DIR / "open_meteo_flood_test.csv", index=False)
    pd.DataFrame(expected_rows).to_csv(TEST_DIR / "open_meteo_expected_risk.csv", index=False)
    history = pd.DataFrame(history_rows)
    history.to_csv(TEST_DIR / "open_meteo_rainy_season_history.csv", index=False)
    (FRONTEND_DATA_DIR / "rainy_season_history.json").write_text(history.to_json(orient="records", indent=2), encoding="utf-8")
    print(f"Wrote deterministic Open-Meteo test fixtures to {TEST_DIR}")


if __name__ == "__main__":
    main()
