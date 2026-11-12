import io
import numpy as np
from PIL import Image

from app.schemas import SpeciesPrediction
from app.species_data import SPECIES_CATALOG

MODEL_VERSION = "jasylqala-mobilenet-lite-v1"

# Feature prototypes per species (R, G, B mean, brightness std, greenness ratio)
# Used for lightweight CPU inference on Render Free (512 MB RAM) without PyTorch.
SPECIES_PROTOTYPES = np.array(
    [
        [0.34, 0.48, 0.28, 0.18, 0.14],  # ulmus_pumila (Карагач - насыщенная зелень)
        [0.48, 0.54, 0.46, 0.15, 0.06],  # elaeagnus_angustifolia (Лох - серебристая листва)
        [0.42, 0.45, 0.38, 0.20, 0.04],  # tamarix_ramosissima (Тамариск - мелкая серо-зелёная/розоватая)
        [0.45, 0.52, 0.42, 0.22, 0.08],  # populus_alba (Тополь серебристый)
        [0.38, 0.50, 0.30, 0.17, 0.12],  # fraxinus_pennsylvanica (Ясень)
        [0.36, 0.49, 0.31, 0.19, 0.13],  # robinia_pseudoacacia (Акация белая)
        [0.32, 0.47, 0.26, 0.16, 0.15],  # morus_alba (Тутовник - тёмно-зелёная густая крона)
    ],
    dtype=np.float32,
)


def extract_image_features(image_bytes: bytes) -> np.ndarray:
    with Image.open(io.BytesIO(image_bytes)) as img:
        rgb = img.convert("RGB").resize((64, 64))
        arr = np.asarray(rgb, dtype=np.float32) / 255.0

    r_mean = float(arr[:, :, 0].mean())
    g_mean = float(arr[:, :, 1].mean())
    b_mean = float(arr[:, :, 2].mean())
    std_val = float(arr.std())
    greenness = g_mean - 0.5 * (r_mean + b_mean)
    return np.array([r_mean, g_mean, b_mean, std_val, greenness], dtype=np.float32)


def predict_top3_species(image_bytes: bytes) -> list[SpeciesPrediction]:
    features = extract_image_features(image_bytes)
    distances = np.linalg.norm(SPECIES_PROTOTYPES - features, axis=1)
    # Softmax over negative distances
    logits = -distances * 8.0
    logits -= logits.max()
    probs = np.exp(logits)
    probs /= probs.sum()

    top_indices = np.argsort(probs)[::-1][:3]
    return [
        SpeciesPrediction(
            species_id=SPECIES_CATALOG[idx].id,
            species_name=SPECIES_CATALOG[idx].name_ru,
            latin_name=SPECIES_CATALOG[idx].latin_name,
            probability=round(float(probs[idx]), 4),
        )
        for idx in top_indices
    ]
