import { useState } from "react";
import { CheckCircle2, CloudDownload, Smartphone, Database, HardDrive, Layers, RefreshCw, X } from "lucide-react";
import { downloadOfflineBundle, downloadOfflinePart, getParts, type BundleProgress } from "../offline/bundle";
import type { OfflineBundleStatus, OfflinePart } from "../types";
import { useInstallApp } from "../utils/install";

interface OfflinePanelProps {
  status: OfflineBundleStatus;
  pendingCount: number;
  isOnline: boolean;
  onClose: () => void;
  onStatusChange: (status: OfflineBundleStatus) => void;
  onSyncNow: () => Promise<void>;
}

export function OfflinePanel({
  status,
  pendingCount,
  isOnline,
  onClose,
  onStatusChange,
  onSyncNow,
}: OfflinePanelProps) {
  const [downloading, setDownloading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<BundleProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { installed, canInstall, ios, install } = useInstallApp();

  const handleDownload = async () => {
    if (!isOnline) {
      setError("Для скачивания офлайн-пакета нужен интернет");
      return;
    }
    setDownloading(true);
    setError(null);
    try {
      const next = await downloadOfflineBundle((p) => setProgress(p));
      onStatusChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка скачивания");
    } finally {
      setDownloading(false);
    }
  };

  const handlePart = async (part: OfflinePart) => {
    if (!isOnline) {
      setError("Для скачивания нужен интернет");
      return;
    }
    setDownloading(true);
    setError(null);
    try {
      onStatusChange(await downloadOfflinePart(part, (p) => setProgress(p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка скачивания");
    } finally {
      setDownloading(false);
    }
  };

  const parts = getParts(status);
  const partRows: Array<{ id: OfflinePart; title: string; hint: string; icon: typeof Layers }> = [
    { id: "data", title: "База деревьев", hint: `${status.treesCount} паспортов · лёгкая`, icon: Database },
    { id: "model", title: "Нейросеть", hint: "определение вида без интернета", icon: HardDrive },
    { id: "map", title: "Карта Актау", hint: `${status.tilesCount} фрагментов · самая тяжёлая`, icon: Layers },
  ];

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await onSyncNow();
    } catch {
      setError("Не удалось синхронизировать");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Офлайн-режим"
      onClick={onClose}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Офлайн-режим</h2>
            <span className="muted" style={{ fontSize: 13 }}>
              Автономная работа в степных и прибрежных зонах
            </span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          Сначала установите приложение, затем при необходимости докачайте тяжёлые части по отдельности: базу деревьев, нейросеть и карту Актау.
        </p>

        {/* Install App */}
        <div className="offline-status-card" data-testid="install-card">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Smartphone size={20} color="var(--color-primary)" />
            <strong>{installed ? "Приложение установлено" : "Установить приложение"}</strong>
          </div>
          {!installed && (
            <>
              <span className="muted" style={{ fontSize: 12 }}>
                Установка на устройство даёт запуск с главного экрана и работу без браузера, в том числе без интернета.
              </span>
              {canInstall ? (
                <button type="button" className="btn-secondary" onClick={() => void install()}>
                  <Smartphone size={14} /> Установить
                </button>
              ) : ios ? (
                <span className="muted" style={{ fontSize: 12 }}>
                  iPhone/iPad: нажмите «Поделиться» → «На экран Домой».
                </span>
              ) : (
                <span className="muted" style={{ fontSize: 12 }}>
                  Если кнопки нет: меню браузера → «Установить приложение» / «Добавить на главный экран».
                </span>
              )}
            </>
          )}
        </div>

        {/* Тяжёлые части скачиваются отдельно */}
        <div className="offline-status-card" data-testid="offline-parts">
          {partRows.map(({ id, title, hint, icon: Icon }) => (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <Icon size={18} color="var(--color-primary)" />
              <div style={{ flex: 1 }}>
                <strong>{title}</strong>
                <div className="muted" style={{ fontSize: 12 }}>{hint}</div>
              </div>
              {parts[id] ? (
                <CheckCircle2 size={20} color="#059669" aria-label={`${title}: скачано`} />
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={downloading || !isOnline}
                  onClick={() => void handlePart(id)}
                  aria-label={`Скачать: ${title}`}
                >
                  <CloudDownload size={14} /> Скачать
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Progress Bar */}
        {progress && (
          <div className="progress-wrap" data-testid="offline-progress">
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>{progress.message}</span>
              <strong style={{ color: "#0f172a" }}>{progress.percent}%</strong>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        )}

        {error && <div className="alert-error">{error}</div>}

        {/* Download Action */}
        <button
          type="button"
          className="btn-primary btn-full"
          disabled={downloading || !isOnline}
          onClick={handleDownload}
        >
          <CloudDownload size={18} />
          {downloading ? "Загрузка..." : status.ready ? "Обновить всё" : "Скачать офлайн"}
        </button>

        {/* Pending Sync Section */}
        {pendingCount > 0 && (
          <div className="sync-box">
            <div>
              <div style={{ fontWeight: 600, color: "#9a3412" }}>
                Ожидают отправки: {pendingCount} дер.
              </div>
              <div className="muted" style={{ fontSize: 11, color: "#c2410c" }}>
                Сохранены в памяти устройства
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary"
              disabled={!isOnline || syncing}
              onClick={handleSync}
            >
              <RefreshCw size={14} className={syncing ? "spin-slow" : ""} />
              {syncing ? "Синхронизация..." : "Отправить"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
