# Project Context

## Title

AI-Powered Flood Risk Forecasting Dashboard with RAG Chatbot

## Purpose

This repository is a portfolio project that forecasts flood risk for selected Lebanon regions using public weather and geospatial-style features. It trains a baseline machine learning model, exports precomputed predictions, displays results in a React dashboard, and includes a grounded chatbot that answers from retrieved project records.

The project is a decision-support prototype, not an official emergency warning system.

## Current Implementation

- React + Vite + TypeScript frontend in `frontend/`
- Tailwind CSS styling
- Leaflet / React-Leaflet map
- Recharts visualizations
- Static JSON prediction data for GitHub Pages deployment
- Python ML pipeline in `ml/`
- Open-Meteo cadaster weather pipeline in `ml/fetch_open_meteo_cadasters.py`
- RAG document and TF-IDF retrieval utilities in `rag/`
- Optional FastAPI backend in `backend/`
- GitHub Actions workflow for frontend deployment
- Scheduled GitHub Actions workflow scaffold for data updates

## Local Runtime

The local development version uses:

- Frontend: `http://localhost:5173/flood-risk-ai-dashboard/`
- Backend: `http://localhost:8000`
- Backend health check: `GET /health`
- Chat endpoint: `POST /chat`

The frontend chatbot first tries the backend endpoint and falls back to local static retrieval if the backend is unavailable.

## Data Sources

Planned and scaffolded sources:

- NASA POWER API for daily weather data:
  - `PRECTOTCORR`
  - `RH2M`
  - `T2M`
  - `WS10M`
- Local region GeoJSON for selected Lebanon areas
- Lebanon cadaster shapefile expected under `C:\Users\Mohammad Mahdi\Documents\Cadasters`
- Cadaster shapefile must include `ACS_Code`
- Open-Meteo forecast and archive APIs for cadaster-level weather
- Demo terrain features in `data/processed/region_static_features.csv`
- SRTM elevation and slope features can replace demo terrain values later
- GloFAS / Copernicus flood data can be added later for validation or hazard layers

## Machine Learning Flow

Pipeline scripts:

- `ml/fetch_nasa_power.py`: fetches NASA POWER daily weather data
- `ml/fetch_open_meteo_cadasters.py`: reads the cadaster shapefile, reprojects to EPSG:4326, calculates representative points, calls Open-Meteo, caches responses, and exports weather CSVs keyed by `ACS_Code`
- `ml/build_features.py`: builds rainfall, humidity, temperature, wind, terrain, and risk-label features
- `ml/train_model.py`: trains a `RandomForestClassifier`
- `ml/predict_latest.py`: exports latest predictions to CSV and JSON
- `ml/evaluate_model.py`: prints saved metrics

Generated artifacts:

- `data/processed/features.csv`
- `data/predictions/risk_predictions.csv`
- `data/predictions/risk_predictions.json`
- `frontend/src/data/risk_predictions.json`
- `ml/model/flood_risk_model.joblib`
- `ml/model/feature_columns.json`
- `ml/model/metrics.json`

The current demo model uses transparent rule-based labels for portfolio purposes. Replace labels with observed flood-impact data for production-grade modeling.

## Cadaster Open-Meteo Pipeline

The cadaster weather script supports:

- `forecast` mode using the Open-Meteo forecast API
- `historical` mode using the Open-Meteo archive API
- cached API responses in `data/raw/open_meteo_cache/`
- rate limiting between requests
- CSV output with `ACS_Code`, latitude, longitude, date/time, precipitation, humidity, temperature, wind speed, and soil moisture columns when available

Example commands:

```bash
python ml/fetch_open_meteo_cadasters.py --mode forecast
python ml/fetch_open_meteo_cadasters.py --mode historical --start-date 2024-01-01 --end-date 2024-01-31
```

Error handling covers missing shapefiles, missing `ACS_Code`, missing CRS, API failures, and unavailable required variables.

## RAG Flow

RAG scripts:

- `rag/build_rag_docs.py`: converts prediction rows into grounded text documents
- `rag/build_vector_index.py`: builds a local TF-IDF retrieval index
- `rag/retrieve_context.py`: retrieves relevant project records and produces a grounded fallback answer

Generated artifacts:

- `rag/vector_store/rag_documents.json`
- `rag/vector_store/tfidf_index.joblib`

Chatbot behavior:

- Answers only from retrieved flood-risk records
- Does not invent risk values
- Says data is unavailable when records do not support an answer
- Provides planning recommendations, not emergency instructions

## Backend Notes

The FastAPI backend supports:

- `GET /health`
- `GET /predictions`
- `GET /regions`
- `POST /chat`
- `POST /predict/latest`

Environment variables are managed through `.env`, which is ignored by Git. Do not commit API keys.

Relevant variables:

- `BACKEND_API_URL`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `OLLAMA_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `MONGODB_URI`

## Frontend Notes

Main dashboard sections:

- KPI cards
- Risk map
- Risk distribution chart
- Rainfall vs risk chart
- Searchable prediction table
- RAG chatbot
- Model information panel

Cadasters or regions without calculated predictions render in grey. Existing sample prediction rows keep the same project colors: Low green, Medium orange, and High red.

For GitHub Pages, `frontend/vite.config.ts` currently uses:

```ts
base: "/flood-risk-ai-dashboard/"
```

If the GitHub repository name changes, update this value.

## Validation Already Run

Successful local checks:

- Python feature generation produced `1320` rows
- Random Forest model trained successfully
- Latest predictions exported successfully
- RAG documents and TF-IDF index generated successfully
- Frontend production build completed successfully with `pnpm run build`
- Backend health endpoint returned `ok`
- Backend chat endpoint returned a grounded answer from project prediction records

Known local environment notes:

- Global `npm` was broken on this Windows profile, so the project uses `corepack pnpm`
- Plain `git status` is blocked by a Windows Git config permission issue unless Git is run with an isolated global config
- `.env` contains local secrets and must remain untracked

## Deployment Plan

Phase 1:

- Push repository to GitHub
- Enable GitHub Pages with source set to GitHub Actions
- Use `.github/workflows/deploy-frontend.yml`

Phase 2:

- Deploy FastAPI backend separately on Render, Railway, Fly.io, or another platform
- Keep API keys only in backend environment variables
- Point frontend to deployed backend with `VITE_BACKEND_API_URL`

Phase 3:

- Automate NASA POWER refresh and prediction export with scheduled GitHub Actions
- Optionally store regions, weather, predictions, RAG documents, and chat logs in MongoDB

## Important Limitations

- NASA POWER is public and near-real-time, but not instant live weather
- GitHub Pages cannot run Python, FastAPI, MongoDB, or model inference
- Static deployment uses precomputed JSON
- Current region boundaries and terrain values are demo-ready
- The project should not be used as an official flood-warning product
