from __future__ import annotations

from fastapi import APIRouter

from services.model_service import load_predictions, load_regions, run_latest_prediction


router = APIRouter()


@router.get("/predictions")
def predictions() -> list[dict]:
    return load_predictions()


@router.get("/regions")
def regions() -> dict:
    return load_regions()


@router.post("/predict/latest")
def predict_latest() -> dict[str, str]:
    return run_latest_prediction()
