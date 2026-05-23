from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routes.chat import router as chat_router
from routes.predict import router as predict_router


load_dotenv()

app = FastAPI(title="Flood Risk AI Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(predict_router)
app.include_router(chat_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
