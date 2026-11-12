from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


ConditionType = Literal["good", "fair", "poor"]
TaskType = Literal["watering", "pruning", "inspection"]
TaskStatusType = Literal["pending", "in_progress", "done"]


class SpeciesOut(BaseModel):
    id: str
    name_ru: str
    name_kk: str
    latin_name: str
    description: str


class SpeciesPrediction(BaseModel):
    species_id: str
    species_name: str
    latin_name: str
    probability: float = Field(..., ge=0.0, le=1.0)


class PredictResponse(BaseModel):
    predictions: list[SpeciesPrediction]
    model_version: str


class CareTaskCreate(BaseModel):
    task_type: TaskType
    notes: str | None = Field(default=None, max_length=1000)
    photo_before_url: str | None = Field(default=None, max_length=500)


class CareTaskUpdate(BaseModel):
    status: TaskStatusType | None = None
    notes: str | None = Field(default=None, max_length=1000)
    photo_after_url: str | None = Field(default=None, max_length=500)


class CareTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tree_id: int
    task_type: str
    status: str
    notes: str | None
    photo_before_url: str | None
    photo_after_url: str | None
    created_at: datetime
    completed_at: datetime | None


class TreeCreate(BaseModel):
    client_id: str | None = Field(default=None, max_length=64)
    species: str = Field(..., min_length=2, max_length=120)
    height_m: float = Field(..., gt=0.0, le=100.0)
    condition: ConditionType = "good"
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    photo_url: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=1000)
    is_demo: bool = False


class TreeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: str | None
    species: str
    height_m: float
    condition: str
    latitude: float
    longitude: float
    photo_url: str | None
    notes: str | None
    is_demo: bool
    created_at: datetime


class TreeDetailOut(TreeOut):
    tasks: list[CareTaskOut] = []


class GeoJSONGeometry(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: list[float]


class GeoJSONFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: int
    geometry: GeoJSONGeometry
    properties: TreeOut


class TreeFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[GeoJSONFeature]


class OfflineSyncRequest(BaseModel):
    trees: list[TreeCreate]


class OfflineSyncResponse(BaseModel):
    synced: int
    skipped_duplicates: int
    trees: list[TreeOut]
