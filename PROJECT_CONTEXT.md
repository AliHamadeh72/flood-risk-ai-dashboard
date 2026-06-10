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
- Replicate-inspired dashboard UI using rounded model-card panels, pill controls, animated blue background, skeleton loaders, and entrance animations
- Rainy-season historical chart from generated Open-Meteo-style records
- Static JSON prediction data for GitHub Pages
- Open-Meteo cadaster weather pipeline in `ml/fetch_open_meteo_cadasters.py`
- Open-Meteo Flood API pipeline in `ml/fetch_open_meteo_flood_cadasters.py`
- Cadaster GeoJSON export in `ml/export_cadaster_geojson.py`
- Open-Meteo prediction builder in `ml/build_open_meteo_predictions.py`
- All-cadaster rainy-season risk builder in `ml/build_rainy_season_risk.py`
- RAG document and TF-IDF retrieval utilities in `rag/`
- Optional FastAPI backend in `backend/`
- Vercel serverless chat endpoint in `api/chat.js`

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

MongoDB upload:

- `scripts/upload-cadaster-risk-to-mongodb.js`
  - reads `data/geo/cadasters.geojson`
  - reads `data/predictions/risk_predictions.json`
  - uploads cadaster geometry/properties to `cadasters`
  - uploads calculated formula output to `cadasterRiskPredictions`
  - upserts the latest row per cadaster to `cadasterRiskLatest`
  - updates `riskStates` with latest flood risk levels for push-notification comparisons
  - writes a run summary to `pipelineRuns`
- root npm scripts:
  - `npm run mongo:upload-cadaster-risk`
  - `npm run pipeline:refresh-and-upload`
- Required env:
  - `MONGODB_URI`
  - `MONGODB_DB` defaults to `flood-risk-ai-dashboard`

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
  - Low = light blue
  - Medium = strong blue
  - High = deep navy
- Uncalculated cadasters are pale blue.
- Popup content shows cadaster name/code, risk level, rainfall, and recommended planning action when available.
- The map supports current forecast and rainy-season modes.
- The rainy-season toggle has a tooltip and optimistic switching label.
- Chatbot cadaster queries can select/zoom the matching cadaster on the map.

## Frontend UX Notes

- The initial loading spinner was replaced with skeleton loaders.
- Skeleton loaders mirror the major page regions: header/nav, status strip, KPI cards, map, charts, chatbot, rainy-season chart, model info, and prediction table.
- The first load intentionally delays briefly so the skeleton state is visible during local testing.
- KPI text animates in from the left.
- The status strip values (`Active layer`, `Calculated cadasters`, `High-risk share`, and `Selected cadaster`) use the same slide-in style as KPI text, with slight staggered delays.
- The header animates upward from the bottom after the skeleton state ends.
- The prediction table paginates 50 rows at a time.
- The chart area shows top-five current-risk cadasters plus the selected cadaster when it is outside the top five.
- The chatbot is positioned below the map and beside the rainy-season chart in the desktop layout so map, chat, and charts can be scanned together.

## RAG Flow

- `rag/build_rag_docs.py` converts prediction rows into grounded text documents.
- `rag/build_vector_index.py` builds a local TF-IDF retrieval index.
- `rag/retrieve_context.py` retrieves relevant records and produces grounded fallback answers.
- The frontend chatbot calls `VITE_BACKEND_API_URL/chat` when configured, otherwise `/api/chat`.
- `api/chat.js` provides a serverless chat endpoint for Vercel deployments.
- The chat endpoint can answer basic conversation, Red Cross-style general flood safety guidance, and grounded cadaster flood-risk questions.
- Data questions are answered from the dashboard prediction records. General conversation is routed through the configured Ollama model when available.

The chatbot should not invent values. If the retrieved records do not contain an answer, it should say the data is unavailable.

## Backend Notes

FastAPI endpoints:

- `GET /health`
- `GET /predictions`
- `GET /regions` returns cadaster GeoJSON
- `POST /chat`
- `POST /predict/latest` rebuilds predictions from Open-Meteo CSV

Environment variables are managed through `.env`, which is ignored by Git.

Important environment variables:

- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `OLLAMA_API_KEY`
- `USE_OLLAMA_WITHOUT_KEY`
- `BACKEND_API_URL`

Do not commit `.env` or expose API keys in frontend code.

## Deployment Notes

- Vercel production deployment is configured and currently used for the public app.
- Production alias: `https://flood-risk-ai-dashboard.vercel.app`
- The frontend can also be deployed statically from precomputed JSON.
- Python and FastAPI must run locally or on a separate backend host.
- Static deployment uses precomputed cadaster GeoJSON and risk prediction JSON.
- GitHub Pages workflows previously failed when Pages was not enabled/configured for GitHub Actions; Vercel is the working production deployment path.

## Validation Notes

Recent checks:

- Cadaster GeoJSON export wrote 1,643 cadasters.
- Open-Meteo forecast smoke test wrote 168 hourly rows for one cadaster.
- Open-Meteo prediction builder wrote one sample cadaster prediction.
- RAG documents rebuilt from the Open-Meteo prediction output.
- Frontend production build passed.
- Vercel production deploy succeeded after the Replicate-inspired redesign.
- Local frontend testing has used Vite URLs such as `http://127.0.0.1:5173/flood-risk-ai-dashboard/` and, for the separate cloned repo only, `http://127.0.0.1:5174/flood-risk-ai-dashboard/`.
- The in-app browser automation bridge has intermittently failed in this Windows sandbox with `windows sandbox failed: spawn setup refresh`; HTTP checks and `npm run build` have been used for verification when that happens.

## Limitations

- The included sample Open-Meteo CSV currently covers one cadaster.
- Full-country updates require many Open-Meteo requests and should be run with caching and rate limiting.
- This is an analytical portfolio prototype, not an official emergency warning system.
- The app currently presents flood-risk data; any fire-risk fork/repo should be treated as a separate project and renamed/refactored deliberately.
