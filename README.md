# AI-Powered Flood Risk Forecasting Dashboard with RAG Chatbot

Portfolio project for visualizing cadaster-level flood-risk indicators in Lebanon using a local cadaster shapefile, Open-Meteo weather data, and a grounded retrieval chatbot.

This project is a decision-support prototype. It is not an official emergency warning system and should not be used as the only source for public-safety decisions.

## What It Includes

- GeoPandas pipeline for reading Lebanon cadasters from a shapefile
- Open-Meteo forecast/archive weather ingestion keyed by `ACS_Code`
- Local API response caching and request rate limiting
- Cadaster GeoJSON export for the React map
- Rule-based Open-Meteo flood-risk scoring into Low, Medium, and High
- Prediction exports to CSV and JSON
- RAG document generation and local retrieval utilities
- React dashboard with map, charts, table, and chatbot
- Optional FastAPI backend scaffold
- GitHub Pages deployment workflow

## Project Structure

```text
data/
  raw/open_meteo/
  raw/open_meteo_cache/
  predictions/
  geo/
ml/
  fetch_open_meteo_cadasters.py
  build_open_meteo_predictions.py
  export_cadaster_geojson.py
rag/
backend/
frontend/
.github/workflows/
```

## Quick Start

### 1. Python Pipeline

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python ml/fetch_open_meteo_cadasters.py --mode forecast --limit 1
python ml/export_cadaster_geojson.py
python ml/build_open_meteo_predictions.py
python rag/build_rag_docs.py
```

Historical mode:

```bash
python ml/fetch_open_meteo_cadasters.py --mode historical --start-date 2024-01-01 --end-date 2024-01-31
```

The default cadaster folder is:

```text
C:\Users\Mohammad Mahdi\Documents\Cadasters
```

The shapefile must contain `ACS_Code`. The pipeline reprojects it to `EPSG:4326`, calculates representative points, calls Open-Meteo, and writes weather rows to `data/raw/open_meteo/`.

### 2. Frontend

```bash
cd frontend
corepack pnpm install
corepack pnpm run dev
```

Open:

```text
http://localhost:5173/flood-risk-ai-dashboard/
```

## Data Sources

- Lebanon cadaster shapefile from `C:\Users\Mohammad Mahdi\Documents\Cadasters`
- Open-Meteo forecast API for current forecast data
- Open-Meteo archive API for historical training or analysis data

Weather variables:

- precipitation
- relative humidity
- temperature
- wind speed
- soil moisture when available

## Map Behavior

The map renders the full cadaster layer from `frontend/src/data/cadasters.json`.

- Cadasters with Open-Meteo predictions use the project risk colors:
  - Low = green
  - Medium = orange
  - High = red
- Cadasters without calculated weather/risk output render grey.

## RAG Chatbot

The chatbot answers from exported prediction records and RAG documents.

Rules:

- Answers use only retrieved project records.
- Missing data is reported as unavailable.
- Recommendations are practical planning suggestions, not emergency instructions.
- API keys must stay in backend environment variables only.

## Optional Backend

Run the FastAPI backend:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Endpoints:

- `GET /predictions`
- `GET /regions`
- `POST /chat`
- `POST /predict/latest`

## Deployment

1. Push this repo to GitHub.
2. In repository settings, set Pages source to GitHub Actions.
3. Keep `frontend/vite.config.ts` base set to `/flood-risk-ai-dashboard/`.
4. The workflow in `.github/workflows/deploy-frontend.yml` builds and publishes `frontend/dist`.

## Limitations

- GitHub Pages cannot run Python, FastAPI, model inference, or secret-backed AI calls.
- Static deployment uses precomputed JSON outputs.
- The included sample Open-Meteo CSV currently covers one cadaster for demonstration.
- Full-country cadaster refreshes should be run locally or on a backend/scheduled worker because they require many API calls.
- The project is educational and analytical, not an official flood-warning product.
