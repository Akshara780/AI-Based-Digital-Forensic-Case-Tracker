import json
import os
from pathlib import Path
from typing import Dict

import joblib
import pandas as pd
import sklearn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


# Resolve paths from this file so the API works when run from the project root.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = PROJECT_ROOT / "ml-service" / "models" / "relevance_model.joblib"
METRICS_PATH = PROJECT_ROOT / "ml-service" / "models" / "metrics.json"

DISCLAIMER = (
    "This is an automated estimate to help decide what to review first. "
    "It is not proof of wrongdoing, and it does not mean anyone did anything wrong. "
    "An investigator must check it against the original evidence."
)
LABEL_ORDER = ["High", "Medium", "Low"]


class PredictionRequest(BaseModel):
    """Validate the evidence fields accepted by the prediction endpoint."""

    evidence_type: str
    case_type: str
    source: str
    description: str = Field(max_length=2000)
    tags: str = Field(max_length=500)
    hour_of_day: int = Field(ge=0, le=23)
    hours_from_incident: float = Field(ge=0, le=100000)
    ip_is_suspicious: int = Field(ge=0, le=1)
    shared_ip_count: int = Field(ge=0, le=1000)
    shared_device_count: int = Field(ge=0, le=1000)
    has_file_attachment: int = Field(ge=0, le=1)
    tag_count: int = Field(ge=0, le=100)


def read_metrics():
    """Read metrics once for startup metadata. Missing metrics are not fatal."""
    if not METRICS_PATH.is_file():
        return None
    with METRICS_PATH.open("r", encoding="utf-8") as metrics_file:
        return json.load(metrics_file)


metrics = read_metrics()
model_name = (
    metrics.get("chosen_model")
    if isinstance(metrics, dict)
    else None
)

# Load the pipeline once; failures are reported by health/predict without stopping startup.
model = None
model_error = None
try:
    if not MODEL_PATH.is_file():
        model_error = f"Model file not found: {MODEL_PATH}"
    else:
        model = joblib.load(MODEL_PATH)
except Exception as error:
    model_error = f"Unable to load model: {error}"


app = FastAPI(title="Digital Evidence Relevance API")

# Read a comma-separated allowlist. A missing value defaults to the Vite local origin.
allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health():
    """Report API health and whether the trained model is available."""
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "model_name": model_name,
        "scikit-learn_version": sklearn.__version__,
    }


@app.post("/predict")
def predict(request: PredictionRequest):
    """Validate input, construct an exact training-column DataFrame, and predict."""
    if model is None:
        raise HTTPException(
            status_code=503,
            detail=model_error or "Model is not loaded",
        )

    # This is the exact feature order used to train and fit the pipeline.
    record = {
        "evidence_type": request.evidence_type,
        "case_type": request.case_type,
        "source": request.source,
        "description": request.description,
        "tags": request.tags,
        "hour_of_day": request.hour_of_day,
        "hours_from_incident": request.hours_from_incident,
        "ip_is_suspicious": request.ip_is_suspicious,
        "shared_ip_count": request.shared_ip_count,
        "shared_device_count": request.shared_device_count,
        "has_file_attachment": request.has_file_attachment,
        "tag_count": request.tag_count,
    }
    feature_columns = [
        "evidence_type",
        "case_type",
        "source",
        "description",
        "tags",
        "hour_of_day",
        "hours_from_incident",
        "ip_is_suspicious",
        "shared_ip_count",
        "shared_device_count",
        "has_file_attachment",
        "tag_count",
    ]
    frame = pd.DataFrame([[record[column] for column in feature_columns]], columns=feature_columns)

    predicted_label = str(model.predict(frame)[0])

    if not hasattr(model, "predict_proba"):
        raise HTTPException(
            status_code=500,
            detail="Loaded model does not support probability prediction",
        )

    class_order = list(model.classes_)
    probability_values = model.predict_proba(frame)[0]
    probability_by_class: Dict[str, float] = {
        str(label): float(probability_values[index])
        for index, label in enumerate(class_order)
    }

    probabilities = {
        label: probability_by_class.get(label, 0.0)
        for label in LABEL_ORDER
    }
    confidence = float(max(probabilities.values()))

    return {
        "predicted_label": predicted_label,
        "confidence": confidence,
        "probabilities": probabilities,
        "model_name": model_name,
        "disclaimer": DISCLAIMER,
    }


@app.get("/metrics")
def get_metrics():
    """Return the metrics file unchanged without calculating or replacing values."""
    loaded_metrics = read_metrics()
    if loaded_metrics is None:
        raise HTTPException(
            status_code=404,
            detail="Metrics file not found",
        )
    return loaded_metrics
