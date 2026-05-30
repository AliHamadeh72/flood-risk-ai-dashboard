# AI-Powered Flood Risk Forecasting Dashboard with RAG Chatbot

Portfolio project for visualizing cadaster-level flood-risk indicators in Lebanon using a local cadaster shapefile, Open-Meteo weather data, and a grounded retrieval chatbot.

This project is a decision-support prototype. It is not an official emergency warning system and should not be used as the only source for public-safety decisions.

## What It Includes

- GeoPandas pipeline for reading Lebanon cadasters from a shapefile
- Open-Meteo forecast/archive weather ingestion keyed by `ACS_Code`
- Open-Meteo Flood API river-discharge ingestion keyed by `ACS_Code`
- Local API response caching and request rate limiting
- Cadaster GeoJSON export for the React map
- Rule-based Open-Meteo flood-risk scoring into Low, Medium, and High
- Prediction exports to CSV and JSON
- Rainy-season historical chart data for November through March
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
  fetch_open_meteo_flood_cadasters.py
  build_open_meteo_predictions.py
  build_rainy_season_risk.py
  export_cadaster_geojson.py
  generate_open_meteo_test_data.py
  validate_open_meteo_model.py
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
python ml/fetch_open_meteo_flood_cadasters.py --limit 1
python ml/export_cadaster_geojson.py
python ml/build_open_meteo_predictions.py
python ml/build_rainy_season_risk.py
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
npm install
npm run dev
```

Open:

```text
http://localhost:5173/flood-risk-ai-dashboard/
```

### 3. Weekly Open-Meteo Refresh

The repo includes a CI-friendly refresh command that uses the checked-in cadaster GeoJSON, makes one 7-day Open-Meteo weather request and one Open-Meteo Flood API request, spatially joins those conditions across every cadaster, rebuilds the prediction CSV/JSON outputs, and updates the frontend data files:

```bash
python ml/weekly_open_meteo_refresh.py
```

Smoke test one cadaster:

```bash
python ml/weekly_open_meteo_refresh.py --limit 1
```

The workflow in `.github/workflows/weekly-open-meteo-refresh.yml` runs every Monday at 03:00 UTC, commits changed data artifacts, and lets Vercel redeploy the static dashboard from Git.

## Data Sources

- Lebanon cadaster shapefile from `C:\Users\Mohammad Mahdi\Documents\Cadasters`
- Open-Meteo forecast API for current forecast data
- Open-Meteo archive API for historical training or analysis data
- Open-Meteo Flood API for daily river discharge data

Weather variables:

- precipitation
- relative humidity
- temperature
- wind speed
- soil moisture when available
- river discharge and discharge ratio when Flood API output is available

## Risk Formula

The current transparent scoring rule combines weather and flood pressure:

```text
score =
  (rainfall_7d / 80) * 0.38
+ (humidity_avg_7d / 100) * 0.17
+ (soil_moisture_component / 45) * 0.15
+ discharge_component * 0.30
```

Where:

```text
soil_moisture_component = min(soil_moisture_avg_7d * 100, 45)
discharge_component = min(river_discharge_ratio, 2.0) / 2.0
river_discharge_ratio = river_discharge_max_7d / river_discharge_mean_7d
```

Labels:

```text
High: rainfall_7d >= 60 OR river_discharge_ratio >= 1.35 OR score >= 0.72
Medium: rainfall_7d >= 25 OR river_discharge_ratio >= 0.85 OR score >= 0.45
Low: otherwise
```

## Validation Data

Generate deterministic test data:

```bash
python ml/generate_open_meteo_test_data.py
```

Validate model labels and visualization coverage:

```bash
python ml/validate_open_meteo_model.py
```

The generated fixture includes one Low, one Medium, and one High cadaster so the map and charts can be visually checked across all risk colors. `ml/build_rainy_season_risk.py` builds `frontend/src/data/rainy_season_history.json` for all exported cadaster codes using observed historical weather/flood rows when available and deterministic seasonal estimates for missing cadasters.

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

### Vercel

1. Import this repository in Vercel.
2. Keep the project root at the repository root.
3. Vercel reads `vercel.json`, installs from `frontend/`, builds with `VITE_BASE_PATH=/`, and serves `frontend/dist`.
4. Add your production domain in Vercel Project Settings > Domains, then point your DNS records to Vercel as instructed.
5. Pushes to `main`, including weekly data-refresh commits, trigger a new production deployment when Vercel Git integration is enabled.

### GitHub Pages

The older GitHub Pages workflow remains available in `.github/workflows/deploy-frontend.yml`. It uses the default Vite base path `/flood-risk-ai-dashboard/`.

## Limitations

- GitHub Pages cannot run Python, FastAPI, model inference, or secret-backed AI calls.
- Static deployment uses precomputed JSON outputs.
- The current forecast layer is generated for every cadaster code in the checked-in GeoJSON by spatially joining one Open-Meteo weather/flood sample across cadaster polygons.
- Full-country cadaster refreshes should be run locally or on a backend/scheduled worker because they require many API calls.
- The project is educational and analytical, not an official flood-warning product.
