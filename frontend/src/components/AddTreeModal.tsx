import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, MapPin, Sparkles, Trash2, X } from "lucide-react";
import { apiUrl, createTree, isNetworkError, predictSpeciesRemote, uploadPhoto } from "../api";
import { addPendingTree } from "../offline/db";
import { predictSpeciesOffline } from "../offline/predictor";
import { compressImage } from "../utils/image";
import type { ConditionType, SpeciesInfo, SpeciesPrediction, Tree } from "../types";
import { PILOT, duplicateRadiusM, findNearbyTrees, isInPilot } from "../pilot";
import { LocationPicker } from "./LocationPicker";

/** Достаточная точность GPS — дальше не ждём */
const GPS_GOOD_ACCURACY_M = 8;
/** Хуже этого — предупреждаем: соседние деревья в аллее стоят в 3–5 м */
const GPS_WARN_ACCURACY_M = 15;
/** Сколько ждём уточнения от спутников */
const GPS_WATCH_MS = 20000;

const NO_TREES: Tree[] = [];

interface AddTreeModalProps {
  speciesCatalog: SpeciesInfo[];
  isOnline: boolean;
  onClose: () => void;
  onCreated: (savedOffline: boolean) => void;
  /** Уже внесённые деревья — для предупреждения о дубле */
  existingTrees?: Tree[];
}

export function AddTreeModal({
  speciesCatalog,
  isOnline,
  onClose,
  onCreated,
  existingTrees = NO_TREES,
}: AddTreeModalProps) {
  const [species, setSpecies] = useState(speciesCatalog[0]?.name_ru || "Карагач (Вяз приземистый)");
  const [heightM, setHeightM] = useState("4.5");
  const [condition, setCondition] = useState<ConditionType>("good");
  // Пусто до получения GPS: раньше здесь стоял центр Актау, и забытый GPS
  // молча сохранял дерево в центре города
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const watchTimerRef = useRef<number | null>(null);
  const bestAccuracyRef = useRef(Infinity);
  const clientIdRef = useRef(`tree-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [notes, setNotes] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<SpeciesPrediction[]>([]);
  const [predicting, setPredicting] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latNum = Number(latitude);
  const lonNum = Number(longitude);
  const coordsValid = latitude !== "" && longitude !== "" && Number.isFinite(latNum) && Number.isFinite(lonNum);
  // Радиус поиска дублей = точность GPS (5–20 м); после ручной постановки точки — 5 м
  const nearby = useMemo(
    () =>
      coordsValid
        ? findNearbyTrees(existingTrees, latNum, lonNum, duplicateRadiusM(accuracy))
        : [],
    [existingTrees, latNum, lonNum, coordsValid, accuracy]
  );
  const zoneHint = coordsValid
    ? isInPilot(latNum, lonNum)
      ? `✓ Внутри пилотного квартала (${PILOT.name})`
      : `Вне пилотного квартала (${PILOT.name}) — дерево не войдёт в счётчик пилота`
    : null;

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // GPS: следим за позицией и оставляем самый точный замер.
  // Телефон обычно сначала даёт грубую точку (по сети, 50–500 м), потом уточняет по спутникам.
  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (watchTimerRef.current !== null) {
      clearTimeout(watchTimerRef.current);
      watchTimerRef.current = null;
    }
    setLocating(false);
  }, []);

  const handleLocate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsStatus("Геолокация не поддерживается браузером — введите координаты вручную");
      return;
    }
    stopWatch();
    bestAccuracyRef.current = Infinity;
    setLocating(true);
    setGpsStatus("Поиск спутников GPS...");

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy;
        if (acc >= bestAccuracyRef.current) return;
        bestAccuracyRef.current = acc;
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setAccuracy(acc);
        setError(null);
        if (acc <= GPS_GOOD_ACCURACY_M) {
          setGpsStatus(`Точность: ~${Math.round(acc)} м`);
          stopWatch();
        } else {
          setGpsStatus(`Точность: ~${Math.round(acc)} м, уточняем...`);
        }
      },
      (err) => {
        // Если хоть один замер уже есть — оставляем его
        if (bestAccuracyRef.current !== Infinity) return;
        stopWatch();
        if (err.code === 1) {
          setGpsStatus("Доступ к геопозиции запрещён в настройках браузера — введите вручную");
        } else {
          setGpsStatus("Сигнал GPS недоступен — выйдите на открытое место или введите вручную");
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: GPS_WATCH_MS }
    );

    watchTimerRef.current = window.setTimeout(() => {
      const best = bestAccuracyRef.current;
      stopWatch();
      setGpsStatus(
        best === Infinity
          ? "Не удалось получить GPS — введите координаты вручную"
          : `Точность: ~${Math.round(best)} м`
      );
    }, GPS_WATCH_MS);
  }, [stopWatch]);

  // Запрашиваем GPS сразу при открытии формы — нельзя полагаться на то, что нажмут кнопку
  useEffect(() => {
    handleLocate();
    return stopWatch;
  }, [handleLocate, stopWatch]);

  // Точку уточнили на карте: это точнее GPS, поэтому поиск спутников останавливаем
  const handlePickOnMap = (lat: number, lon: number) => {
    stopWatch();
    setAccuracy(null);
    setLatitude(lat.toFixed(6));
    setLongitude(lon.toFixed(6));
    setGpsStatus("Точка поставлена на карте");
    setError(null);
  };

  const handleManualCoord = (setter: (v: string) => void, value: string) => {
    stopWatch();
    setAccuracy(null);
    setGpsStatus("Координаты введены вручную");
    setter(value);
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
    const h = Number(heightM);

    if (!coordsValid) {
      setError("Нет координат: дождитесь GPS, нажмите «Найти меня» или введите вручную");
      return;
    }
    if (latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
      setError("Укажите корректные GPS-координаты");
      return;
    }
    if (Number.isNaN(h) || h <= 0 || h > 100) {
      setError("Высота должна быть от 0.1 до 100 м");
      return;
    }

    setBusy(true);
    setError(null);
    stopWatch();

    // client_id создаётся один раз на форму: повторное нажатие не создаст дубль на сервере
    const clientId = clientIdRef.current;
    const processedPhoto = photoFile ? await compressImage(photoFile) : null;

    const saveToPhone = async (uploadedPhotoUrl: string | null) => {
      let photoDataUrl: string | undefined;
      if (processedPhoto && !uploadedPhotoUrl) {
        photoDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => resolve("");
          reader.readAsDataURL(processedPhoto);
        });
      }
      await addPendingTree({
        client_id: clientId,
        species,
        height_m: h,
        condition,
        latitude: latNum,
        longitude: lonNum,
        notes: notes.trim(),
        // Если фото уже успело загрузиться — второй раз не грузим
        photo_url: uploadedPhotoUrl,
        photoBlob: uploadedPhotoUrl ? undefined : processedPhoto || undefined,
        photoDataUrl: uploadedPhotoUrl ? undefined : photoDataUrl,
        created_at: new Date().toISOString(),
      });
      onCreated(true);
    };

    try {
      if (!isOnline) {
        await saveToPhone(null);
        return;
      }

      let photoUrl: string | null = null;
      try {
        if (processedPhoto) {
          photoUrl = await uploadPhoto(processedPhoto, photoFile?.name || "photo.jpg");
        }
        await createTree({
          client_id: clientId,
          species,
          height_m: h,
          condition,
          latitude: latNum,
          longitude: lonNum,
          photo_url: photoUrl,
          notes: notes.trim() || null,
          is_demo: false,
        });
        onCreated(false);
      } catch (err) {
        // Связь пропала или сервер спит — не теряем дерево, кладём в очередь на телефоне
        if (isNetworkError(err)) {
          await saveToPhone(photoUrl);
          return;
        }
        throw err;
      }
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
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={handleLocate}
                disabled={locating}
              >
                <MapPin size={14} color="var(--color-primary)" />
                {locating ? "Ищем..." : "Найти меня"}
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
                onChange={(e) => handleManualCoord(setLatitude, e.target.value)}
                aria-label="Широта"
                placeholder="Широта (напр. 43.6532)"
              />
              <input
                type="number"
                step="0.000001"
                value={longitude}
                onChange={(e) => handleManualCoord(setLongitude, e.target.value)}
                aria-label="Долгота"
                placeholder="Долгота (напр. 51.1605)"
              />
            </div>
            <LocationPicker
              lat={coordsValid ? latNum : null}
              lon={coordsValid ? lonNum : null}
              accuracy={accuracy}
              trees={existingTrees}
              onPick={handlePickOnMap}
            />
            {accuracy !== null && accuracy > GPS_WARN_ACCURACY_M && !locating && (
              <div className="alert-info" data-testid="gps-accuracy-warning">
                Точность GPS ~{Math.round(accuracy)} м — можно перепутать с соседним деревом.
                Поправьте метку на карте или выйдите из-под крон и нажмите «Найти меня».
              </div>
            )}
            {zoneHint && (
              <span className="muted" style={{ fontSize: 12 }} data-testid="pilot-zone-hint">
                {zoneHint}
              </span>
            )}
            {nearby.length > 0 && (
              <div className="nearby-box" role="alert" data-testid="duplicate-warning">
                <strong>Рядом уже внесены деревья — это не одно из них?</strong>
                <ul className="nearby-list">
                  {nearby.map(({ tree, distance }) => (
                    <li key={tree.client_id || tree.id} className="nearby-item">
                      {tree.photo_url ? (
                        <img
                          className="nearby-thumb"
                          src={tree.photo_url.startsWith("data:") ? tree.photo_url : apiUrl(tree.photo_url)}
                          alt=""
                        />
                      ) : (
                        <span className="nearby-thumb nearby-thumb-empty" />
                      )}
                      <span>
                        {tree.species}, {tree.height_m} м
                        <span className="muted"> · ~{Math.max(1, Math.round(distance))} м отсюда</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <span className="muted" style={{ fontSize: 12 }}>
                  Если это новое дерево — поставьте метку точно на него и сохраняйте.
                </span>
              </div>
            )}
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
