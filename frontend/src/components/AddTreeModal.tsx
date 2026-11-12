import { useEffect, useState } from "react";
import { Camera, Check, MapPin, Sparkles, Trash2, X } from "lucide-react";
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

  const handleRemovePhoto = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPhotoFile(null);
    setPreviewUrl(null);
    setPredictions([]);
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
          <div>
            <h2>Добавить дерево</h2>
            <span className="muted" style={{ fontSize: 13 }}>
              Электронный паспорт зелёного насаждения
            </span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        {!isOnline && (
          <div className="alert-info">
            Офлайн: сохранится в телефон (автоматическая синхронизация при появлении сети)
          </div>
        )}

        {error && <div className="alert-error">{error}</div>}

        <form className="add-tree-form" onSubmit={handleSubmit}>
          {/* Photo upload / Preview card */}
          {!previewUrl ? (
            <label className="upload-box">
              <Camera size={24} />
              <div style={{ textAlign: "center" }}>
                <strong>Фото с камеры или галереи</strong>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  Автоматическое сжатие до 1600px • Анализ вида
                </div>
              </div>
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => handlePhotoChange(e.target.files?.[0] || null)}
              />
            </label>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "#f0fdf4",
                borderRadius: "var(--radius-md)",
                border: "1px solid #86efac",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img src={previewUrl} alt="Выбранное фото" className="photo-preview-thumb" />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#166534" }}>
                    {photoFile ? photoFile.name : "Фото выбрано"}
                  </div>
                  <div style={{ fontSize: 11, color: "#15803d" }}>
                    Сжато и готово к анализу
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={handleRemovePhoto}
                title="Удалить фото"
                style={{ color: "#ef4444" }}
              >
                <Trash2 size={18} />
              </button>
            </div>
          )}

          {predicting && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                background: "#f8fafc",
                borderRadius: "var(--radius-sm)",
                fontSize: 13,
                color: "var(--color-primary)",
              }}
            >
              <Sparkles size={16} className="spin-slow" />
              <span>Нейросеть распознаёт породу дерева...</span>
            </div>
          )}

          {/* Species Predictions */}
          {predictions.length > 0 && (
            <div className="predictions-box" data-testid="predictions-box">
              <div className="predictions-title">
                <Sparkles size={16} /> Результат нейросети (Топ-3 вида):
              </div>
              <div className="predictions-list">
                {predictions.map((p) => {
                  const isActive = species === p.species_name;
                  const pct = Math.round(p.probability * 100);
                  return (
                    <button
                      key={p.species_id}
                      type="button"
                      className={`prediction-chip ${isActive ? "active" : ""}`}
                      onClick={() => setSpecies(p.species_name)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isActive && <Check size={16} color="var(--color-primary)" />}
                        <span>{p.species_name}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{
                            width: 60,
                            height: 6,
                            background: "#e2e8f0",
                            borderRadius: 999,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              background: isActive ? "var(--color-primary)" : "#94a3b8",
                            }}
                          />
                        </div>
                        <strong style={{ minWidth: 32, textAlign: "right" }}>{pct}%</strong>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Species Select */}
          <label>
            Вид дерева (Мангистау)
            <select value={species} onChange={(e) => setSpecies(e.target.value)}>
              {speciesCatalog.map((s) => (
                <option key={s.id} value={s.name_ru}>
                  {s.name_ru}
                </option>
              ))}
            </select>
          </label>

          {/* Height and Condition */}
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
                placeholder="4.5"
                required
              />
            </label>

            <label>
              Состояние
              <div className="condition-picker">
                <button
                  type="button"
                  className={`condition-pill-btn ${condition === "good" ? "active good" : ""}`}
                  onClick={() => setCondition("good")}
                >
                  🟢 Хор.
                </button>
                <button
                  type="button"
                  className={`condition-pill-btn ${condition === "fair" ? "active fair" : ""}`}
                  onClick={() => setCondition("fair")}
                >
                  🟡 Сред.
                </button>
                <button
                  type="button"
                  className={`condition-pill-btn ${condition === "poor" ? "active poor" : ""}`}
                  onClick={() => setCondition("poor")}
                >
                  🔴 Слаб.
                </button>
              </div>
              {/* Keep native select hidden for standard form sync and accessibility */}
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as ConditionType)}
                style={{ display: "none" }}
              >
                <option value="good">Хорошее</option>
                <option value="fair">Среднее</option>
                <option value="poor">Слабое</option>
              </select>
            </label>
          </div>

          {/* GPS Location Block */}
          <div className="gps-block">
            <div className="gps-header">
              <span>Координаты (GPS)</span>
              <button type="button" className="btn-secondary btn-sm" onClick={handleLocate}>
                <MapPin size={14} color="var(--color-primary)" /> Найти меня
              </button>
            </div>
            {gpsStatus && (
              <span className="muted" style={{ fontSize: 12 }}>
                {gpsStatus}
              </span>
            )}
            <div className="form-row">
              <input
                type="number"
                step="0.000001"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                aria-label="Широта"
                placeholder="Широта (напр. 43.6532)"
                required
              />
              <input
                type="number"
                step="0.000001"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                aria-label="Долгота"
                placeholder="Долгота (напр. 51.1605)"
                required
              />
            </div>
          </div>

          {/* Notes */}
          <label>
            Заметка / Ориентир
            <textarea
              rows={2}
              placeholder="Микрорайон, сквер, ориентир..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          {/* Submit */}
          <button type="submit" className="btn-primary btn-full" disabled={busy}>
            {busy ? "Сохраняем..." : "🌿 Сохранить паспорт дерева"}
          </button>
        </form>
      </div>
    </div>
  );
}
