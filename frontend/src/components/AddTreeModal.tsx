import { useEffect, useState } from "react";
import { Camera, MapPin, Sparkles, X } from "lucide-react";
import { createTree, predictSpeciesRemote, uploadPhoto } from "../api";
import { addPendingTree } from "../offline/db";
import { predictSpeciesOffline } from "../offline/predictor";
import { compressImage } from "../utils/image";
import type { ConditionType, SpeciesInfo, SpeciesPrediction } from "../types";

interface AddTreeModalProps {
  speciesCatalog: SpeciesInfo[];
  isOnline: boolean;
  onClose: () => void;
  onCreated: (savedOffline: boolean) => void;
}

export function AddTreeModal({
  speciesCatalog,
  isOnline,
  onClose,
  onCreated,
}: AddTreeModalProps) {
  const [species, setSpecies] = useState(speciesCatalog[0]?.name_ru || "Карагач (Вяз приземистый)");
  const [heightM, setHeightM] = useState("4.5");
  const [condition, setCondition] = useState<ConditionType>("good");
  const [latitude, setLatitude] = useState("43.6532");
  const [longitude, setLongitude] = useState("51.1605");
  const [notes, setNotes] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<SpeciesPrediction[]>([]);
  const [predicting, setPredicting] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleLocate = () => {
    if (!navigator.geolocation) {
      setGpsStatus("Геолокация не поддерживается браузером");
      return;
    }
    setGpsStatus("Поиск спутников GPS...");

    const onPos = (pos: GeolocationPosition) => {
      setLatitude(pos.coords.latitude.toFixed(6));
      setLongitude(pos.coords.longitude.toFixed(6));
      setGpsStatus(`Точность: ~${Math.round(pos.coords.accuracy)} м`);
      setError(null);
    };

    const onErr = (err: GeolocationPositionError) => {
      if (err.code === 1) {
        setGpsStatus("Доступ к геопозиции запрещён в настройках браузера");
      } else if (err.code === 3) {
        // High accuracy timed out, retry with standard cell/network location
        setGpsStatus("Уточняем по сети...");
        navigator.geolocation.getCurrentPosition(
          onPos,
          () => setGpsStatus("Не удалось получить GPS (введите вручную)"),
          { enableHighAccuracy: false, timeout: 6000 }
        );
      } else {
        setGpsStatus("Сигнал GPS недоступен (введите вручную)");
      }
    };

    navigator.geolocation.getCurrentPosition(onPos, onErr, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 30000,
    });
  };

  const handlePhotoChange = async (file: File | null) => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPhotoFile(file);
    setPredictions([]);
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));

    setPredicting(true);
    try {
      let preds: SpeciesPrediction[] = [];
      try {
        preds = await predictSpeciesOffline(file);
      } catch {
        if (isOnline) {
          preds = await predictSpeciesRemote(file);
        }
      }
      setPredictions(preds);
      if (preds.length > 0) {
        setSpecies(preds[0].species_name);
      }
    } catch {
      // Non-blocking: user can still pick species manually
    } finally {
      setPredicting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const lat = Number(latitude);
    const lon = Number(longitude);
    const h = Number(heightM);

    if (Number.isNaN(lat) || lat < -90 || lat > 90 || Number.isNaN(lon) || lon < -180 || lon > 180) {
      setError("Укажите корректные GPS-координаты");
      return;
    }
    if (Number.isNaN(h) || h <= 0 || h > 100) {
      setError("Высота должна быть от 0.1 до 100 м");
      return;
    }

    setBusy(true);
    setError(null);

    const clientId = `tree-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const processedPhoto = photoFile ? await compressImage(photoFile) : null;

    if (!isOnline) {
      let photoDataUrl: string | undefined;
      if (processedPhoto) {
        photoDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.readAsDataURL(processedPhoto);
        });
      }
      await addPendingTree({
        client_id: clientId,
        species,
        height_m: h,
        condition,
        latitude: lat,
        longitude: lon,
        notes: notes.trim(),
        photoBlob: processedPhoto || undefined,
        photoDataUrl,
        created_at: new Date().toISOString(),
      });
      setBusy(false);
      onCreated(true);
      return;
    }

    try {
      let photoUrl: string | null = null;
      if (processedPhoto) {
        photoUrl = await uploadPhoto(processedPhoto, photoFile?.name || "photo.jpg");
      }
      await createTree({
        client_id: clientId,
        species,
        height_m: h,
        condition,
        latitude: lat,
        longitude: lon,
        photo_url: photoUrl,
        notes: notes.trim() || null,
        is_demo: false,
      });
      onCreated(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Добавить дерево"
      onClick={onClose}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Добавить дерево</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        {!isOnline && (
          <div className="alert-info">Офлайн: сохранится в телефон</div>
        )}

        {error && <div className="alert-error">{error}</div>}

        <form className="add-tree-form" onSubmit={handleSubmit}>
          <label className="upload-box">
            {previewUrl ? (
              <img src={previewUrl} alt="Выбранное фото" className="photo-preview-thumb" />
            ) : (
              <Camera size={20} />
            )}
            <span>{photoFile ? photoFile.name : "Фото с камеры или галереи"}</span>
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => handlePhotoChange(e.target.files?.[0] || null)}
            />
          </label>

          {predicting && <p className="muted">Определение вида...</p>}

          {predictions.length > 0 && (
            <div className="predictions-box" data-testid="predictions-box">
              <div className="predictions-title">
                <Sparkles size={15} /> Топ-3 вида:
              </div>
              <div className="predictions-list">
                {predictions.map((p) => (
                  <button
                    key={p.species_id}
                    type="button"
                    className={`prediction-chip ${species === p.species_name ? "active" : ""}`}
                    onClick={() => setSpecies(p.species_name)}
                  >
                    <span>{p.species_name}</span>
                    <strong>{Math.round(p.probability * 100)}%</strong>
                  </button>
                ))}
              </div>
            </div>
          )}

          <label>
            Вид дерева
            <select value={species} onChange={(e) => setSpecies(e.target.value)}>
              {speciesCatalog.map((s) => (
                <option key={s.id} value={s.name_ru}>
                  {s.name_ru}
                </option>
              ))}
            </select>
          </label>

          <div className="form-row">
            <label>
              Высота (м)
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="100"
                value={heightM}
                onChange={(e) => setHeightM(e.target.value)}
                required
              />
            </label>
            <label>
              Состояние
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as ConditionType)}
              >
                <option value="good">Хорошее</option>
                <option value="fair">Среднее</option>
                <option value="poor">Слабое</option>
              </select>
            </label>
          </div>

          <div className="gps-block">
            <div className="gps-header">
              <span>GPS</span>
              <button type="button" className="btn-secondary btn-sm" onClick={handleLocate}>
                <MapPin size={14} /> Определить
              </button>
            </div>
            {gpsStatus && <span className="muted">{gpsStatus}</span>}
            <div className="form-row">
              <input
                type="number"
                step="0.000001"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                aria-label="Широта"
                required
              />
              <input
                type="number"
                step="0.000001"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                aria-label="Долгота"
                required
              />
            </div>
          </div>

          <label>
            Заметка
            <textarea
              rows={2}
              placeholder="Ориентир..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <button type="submit" className="btn-primary btn-full" disabled={busy}>
            {busy ? "Сохраняем..." : "Сохранить"}
          </button>
        </form>
      </div>
    </div>
  );
}
