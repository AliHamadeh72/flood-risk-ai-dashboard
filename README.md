# AI-Powered Flood Risk Forecasting Dashboard with RAG Chatbot

Portfolio project for forecasting flood risk across selected Lebanon regions using public weather data, engineered terrain features, a machine learning classifier, and a grounded retrieval chatbot.

This project is a decision-support prototype. It is not an official emergency warning system and should not be used as the only source for public-safety decisions.

## What It Includes

- Python data pipeline for NASA POWER weather ingestion
- Python pipeline for Lebanon cadaster weather ingestion from Open-Meteo
- Feature engineering for rainfall, humidity, wind, temperature, elevation, and slope
- Random Forest flood-risk classifier with Low, Medium, and High labels
- Prediction exports to CSV and JSON
- RAG document generation and local retrieval utilities
- Static React dashboard for GitHub Pages
- Local chatbot prototype that answers from exported project records
- Optional FastAPI backend scaffold for a full-stack version
- GitHub Actions workflow for frontend deployment

## Project Structure

```text
data/
  raw/
  processed/
  predictions/
  geo/
ml/
  fetch_nasa_power.py
  build_features.py
  train_model.py
  predict_latest.py
  evaluate_model.py
  model/
rag/
  build_rag_docs.py
  build_vector_index.py
  retrieve_context.py
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
python ml/build_features.py
python ml/train_model.py
python ml/predict_latest.py
python rag/build_rag_docs.py
```

`ml/fetch_nasa_power.py` can fetch public NASA POWER data when you are online:

```bash
python ml/fetch_nasa_power.py --start 20240101 --end 20240523
```

`ml/fetch_open_meteo_cadasters.py` reads the Lebanon cadaster shapefile, reprojects it to EPSG:4326, calculates representative points, and fetches weather for each `ACS_Code` from Open-Meteo.

Forecast mode:

```bash
python ml/fetch_open_meteo_cadasters.py --mode forecast
```

Historical mode:

```bash
python ml/fetch_open_meteo_cadasters.py --mode historical --start-date 2024-01-01 --end-date 2024-01-31
```

The default cadaster folder is:

```text
C:\Users\Mohammad Mahdi\Documents\Cadasters
```

The script caches API responses under `data/raw/open_meteo_cache/`, rate-limits requests, and writes CSV output under `data/raw/open_meteo/`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

For GitHub Pages, `frontend/vite.config.ts` uses:

```ts
base: "/flood-risk-ai-dashboard/"
```

If your repository has a different name, update that value.

## Data Sources

- NASA POWER daily meteorological API for precipitation, humidity, temperature, and wind speed.
- Open-Meteo forecast/archive APIs for cadaster-level precipitation, relative humidity, temperature, wind speed, and available soil moisture variables.
- Local GeoJSON region boundaries in `data/geo/regions.geojson`.
- Terrain features are represented in `data/processed/region_static_features.csv`; these can be replaced with SRTM-derived elevation and slope.
- GloFAS/Copernicus can be added later as a validation or hazard-reference layer.

## Model

The baseline model is a `RandomForestClassifier`. For the portfolio version, labels are generated using a transparent rule:

- High risk: high recent rainfall plus low elevation or low slope
- Medium risk: moderate rainfall or moderate terrain vulnerability
- Low risk: low rainfall with safer terrain features

Saved artifacts:

- `ml/model/flood_risk_model.joblib`
- `ml/model/feature_columns.json`
- `ml/model/metrics.json`

## RAG Chatbot

The static frontend chatbot performs local keyword retrieval over `risk_predictions.json`. The Python RAG utilities generate grounded text documents from prediction rows and provide a TF-IDF retrieval prototype.

Rules:

- Answers use only retrieved project records.
- Missing data is reported as unavailable.
- Recommendations are practical planning suggestions, not emergency instructions.
- API keys must stay in the backend only.

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
3. Update `frontend/vite.config.ts` if the repository name is not `flood-risk-ai-dashboard`.
4. The workflow in `.github/workflows/deploy-frontend.yml` builds and publishes `frontend/dist`.

## Limitations

- NASA POWER is near-real-time, not instant live weather.
- GitHub Pages cannot run Python model inference, FastAPI, MongoDB, or secret-backed AI calls.
- Current boundaries and terrain values are demo-ready; replace them with official cadasters and SRTM-derived features for production-quality geospatial work.
- The project is educational and analytical, not an official flood-warning product.
- Cadasters without calculated predictions are displayed in grey on the map; sample prediction records keep the existing Low, Medium, and High colors.
