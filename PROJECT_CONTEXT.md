# Project Context

## Title

AI-Powered Flood Risk Forecasting Dashboard with RAG Chatbot

## Purpose

This repository visualizes cadaster-level flood-risk indicators for Lebanon using a local cadasters shapefile, Open-Meteo weather data, precomputed JSON/CSV outputs, and a grounded retrieval chatbot.

The project is a decision-support prototype, not an official emergency warning system.

## Current Implementation

- React + Vite + TypeScript frontend in `frontend/`
- Leaflet cadaster risk map
- Recharts visualizations
- Rainy-season historical chart from generated Open-Meteo-style records
- Static JSON prediction data for GitHub Pages
- Open-Meteo cadaster weather pipeline in `ml/fetch_open_meteo_cadasters.py`
- Open-Meteo Flood API pipeline in `ml/fetch_open_meteo_flood_cadasters.py`
- Cadaster GeoJSON export in `ml/export_cadaster_geojson.py`
- Open-Meteo prediction builder in `ml/build_open_meteo_predictions.py`
- All-cadaster rainy-season risk builder in `ml/build_rainy_season_risk.py`
- RAG document and TF-IDF retrieval utilities in `rag/`
- Optional FastAPI backend in `backend/`

## Cadaster Data

The source shapefile is expected at:

```text
C:\Users\Mohammad Mahdi\Documents\Cadasters
```

The shapefile must include:

- `ACS_Code`
- geometry

The current detected shapefile has 1,643 cadasters and source CRS `EPSG:32636`. The export pipeline reprojects it to `EPSG:4326`.

## Open-Meteo Pipeline

Scripts:

- `ml/fetch_open_meteo_cadasters.py`
  - finds and reads the shapefile with GeoPandas
  - validates `ACS_Code`
  - reprojects to `EPSG:4326`
  - calculates representative points
  - calls Open-Meteo forecast or archive APIs
  - fetches precipitation, humidity, temperature, wind speed, and soil moisture when available
  - caches responses in `data/raw/open_meteo_cache/`
  - rate-limits requests
  - exports CSV rows keyed by `ACS_Code`
- `ml/fetch_open_meteo_flood_cadasters.py`
  - calls `https://flood-api.open-meteo.com/v1/flood`
  - fetches daily `river_discharge`, `river_discharge_mean`, `river_discharge_max`, and `river_discharge_p75`
  - writes cadaster flood CSV rows keyed by `ACS_Code`
- `ml/export_cadaster_geojson.py`
  - exports frontend-ready cadaster GeoJSON to `frontend/src/data/cadasters.json`
  - also writes `data/geo/cadasters.geojson`
- `ml/build_open_meteo_predictions.py`
  - aggregates Open-Meteo weather rows by `ACS_Code`
  - joins Flood API river-discharge features when available
  - computes Low, Medium, or High risk labels
  - writes `data/predictions/risk_predictions.csv`
  - writes `data/predictions/risk_predictions.json`
  - writes `frontend/src/data/risk_predictions.json`
- `ml/build_rainy_season_risk.py`
  - computes rainy-season risk with the same weather and flood scoring formula
  - uses historical Open-Meteo weather/flood CSVs when available
  - fills missing cadaster codes with deterministic seasonal estimates so the full cadaster map can be visualized
  - writes `data/predictions/rainy_season_history.csv`
  - writes `frontend/src/data/rainy_season_history.json`

Example commands:

```bash
python ml/fetch_open_meteo_cadasters.py --mode forecast --limit 1
python ml/fetch_open_meteo_flood_cadasters.py --limit 1
python ml/fetch_open_meteo_cadasters.py --mode historical --start-date 2024-01-01 --end-date 2024-01-31
python ml/export_cadaster_geojson.py
python ml/build_open_meteo_predictions.py
python ml/build_rainy_season_risk.py
```

## Validation Fixtures

- `ml/generate_open_meteo_test_data.py` writes deterministic weather, flood, and expected-risk fixtures under `data/test/`.
- `ml/validate_open_meteo_model.py` rebuilds predictions from those fixtures and checks expected labels.
- The current fixture covers Low, Medium, and High, so it also validates visualization color coverage.
- `frontend/src/data/rainy_season_history.json` is generated for all exported cadasters by `ml/build_rainy_season_risk.py`.

Recent validation result:

```text
accuracy: 1.0
distribution: Low=1, Medium=1, High=1
```

## Frontend Map

The risk map now uses cadasters instead of demo region polygons.

- Calculated cadasters are colored by risk:
  - Low = green
  - Medium = orange
  - High = red
- Uncalculated cadasters are grey.
- Popup content shows cadaster name/code, risk level, rainfall, and recommended planning action when available.

## RAG Flow

- `rag/build_rag_docs.py` converts prediction rows into grounded text documents.
- `rag/build_vector_index.py` builds a local TF-IDF retrieval index.
- `rag/retrieve_context.py` retrieves relevant records and produces grounded fallback answers.

The chatbot should not invent values. If the retrieved records do not contain an answer, it should say the data is unavailable.

## Backend Notes

FastAPI endpoints:

- `GET /health`
- `GET /predictions`
- `GET /regions` returns cadaster GeoJSON
- `POST /chat`
- `POST /predict/latest` rebuilds predictions from Open-Meteo CSV

Environment variables are managed through `.env`, which is ignored by Git.

## Deployment Notes

- GitHub Pages deploys the static frontend.
- Python and FastAPI must run locally or on a separate backend host.
- Static deployment uses precomputed cadaster GeoJSON and risk prediction JSON.

## Validation Notes

Recent checks:

- Cadaster GeoJSON export wrote 1,643 cadasters.
- Open-Meteo forecast smoke test wrote 168 hourly rows for one cadaster.
- Open-Meteo prediction builder wrote one sample cadaster prediction.
- RAG documents rebuilt from the Open-Meteo prediction output.
- Frontend production build passed.

## Limitations

- The included sample Open-Meteo CSV currently covers one cadaster.
- Full-country updates require many Open-Meteo requests and should be run with caching and rate limiting.
- This is an analytical portfolio prototype, not an official emergency warning system.
