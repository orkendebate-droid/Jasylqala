import { useCallback, useEffect, useMemo, useState } from "react";
import { CloudDownload, Plus, Trees, Wifi, WifiOff } from "lucide-react";
import { fetchSpecies, fetchTreeDetail, fetchTrees } from "./api";
import { AddTreeModal } from "./components/AddTreeModal";
import { OfflinePanel } from "./components/OfflinePanel";
import { TreeMap } from "./components/TreeMap";
import { TreePassportModal } from "./components/TreePassportModal";
import {
  getBundleStatus,
  getCachedSpecies,
  getCachedTrees,
  getPendingTrees,
  saveCachedSpecies,
  saveCachedTrees,
  syncPendingTrees,
} from "./offline/db";
import type { OfflineBundleStatus, SpeciesInfo, Tree } from "./types";

export function App() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [trees, setTrees] = useState<Tree[]>([]);
  const [pendingTrees, setPendingTrees] = useState<Tree[]>([]);
  const [speciesCatalog, setSpeciesCatalog] = useState<SpeciesInfo[]>([]);
  const [selectedSpecies, setSelectedSpecies] = useState("");
  const [selectedCondition, setSelectedCondition] = useState("");
  const [activeTree, setActiveTree] = useState<Tree | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showOfflinePanel, setShowOfflinePanel] = useState(false);
  const [bundleStatus, setBundleStatus] = useState<OfflineBundleStatus>({
    ready: false,
    downloadedAt: null,
    treesCount: 0,
    tilesCount: 0,
  });
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadPending = useCallback(async () => {
    const pending = await getPendingTrees();
    const mapped: Tree[] = pending.map((p, idx) => ({
      id: -(idx + 1),
      client_id: p.client_id,
      species: p.species,
      height_m: p.height_m,
      condition: p.condition,
      latitude: p.latitude,
      longitude: p.longitude,
      photo_url: p.photoDataUrl || null,
      notes: p.notes || null,
      is_demo: false,
      created_at: p.created_at,
    }));
    setPendingTrees(mapped);
  }, []);

  const loadData = useCallback(async () => {
    try {
      if (isOnline) {
        // Auto-sync any pending offline trees on startup/refresh
        const pending = await getPendingTrees();
        if (pending.length > 0) {
          const syncRes = await syncPendingTrees();
          if (syncRes.synced > 0) {
            showToast(`Синхронизировано: ${syncRes.synced} дер.`);
          }
        }

        const [fc, species] = await Promise.all([fetchTrees(), fetchSpecies()]);
        const list = fc.features.map((f) => f.properties);
        setTrees(list);
        setSpeciesCatalog(species);
        await Promise.all([saveCachedTrees(list), saveCachedSpecies(species)]);
      } else {
        const [cachedT, cachedS] = await Promise.all([
          getCachedTrees(),
          getCachedSpecies(),
        ]);
        setTrees(cachedT);
        setSpeciesCatalog(cachedS);
      }
    } catch {
      setIsOnline(false);
      const [cachedT, cachedS] = await Promise.all([
        getCachedTrees(),
        getCachedSpecies(),
      ]);
      setTrees(cachedT);
      setSpeciesCatalog(cachedS);
    }
    await loadPending();
    setBundleStatus(await getBundleStatus());
  }, [isOnline, loadPending, showToast]);

  const handleSyncNow = useCallback(async () => {
    const res = await syncPendingTrees();
    if (res.synced > 0) {
      showToast(`Отправлено на сервер: ${res.synced} дер.`);
    }
    await loadData();
  }, [loadData, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      handleSyncNow();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [handleSyncNow]);

  const allVisibleTrees = useMemo(() => {
    const serverClientIds = new Set(
      trees.map((t) => t.client_id).filter(Boolean)
    );
    const uniquePending = pendingTrees.filter(
      (p) => !p.client_id || !serverClientIds.has(p.client_id)
    );
    return [...uniquePending, ...trees].filter((t) => {
      if (selectedSpecies && t.species !== selectedSpecies) return false;
      if (selectedCondition && t.condition !== selectedCondition) return false;
      return true;
    });
  }, [pendingTrees, trees, selectedSpecies, selectedCondition]);

  const handleSelectTree = useCallback(
    async (tree: Tree) => {
      setActiveTree(tree);
      if (tree.id > 0 && isOnline) {
        try {
          const detail = await fetchTreeDetail(tree.id);
          setActiveTree(detail);
        } catch {
          // Keep basic tree info if detail fetch fails
        }
      }
    },
    [isOnline]
  );

  const handleTreeUpdated = async (treeId: number) => {
    await loadData();
    if (treeId > 0 && isOnline) {
      const detail = await fetchTreeDetail(treeId);
      setActiveTree(detail);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Trees size={20} />
          <strong>Jasylqala</strong>
        </div>

        <div className="filters">
          <select
            aria-label="Фильтр по виду"
            value={selectedSpecies}
            onChange={(e) => setSelectedSpecies(e.target.value)}
          >
            <option value="">Все виды ({trees.length + pendingTrees.length})</option>
            {speciesCatalog.map((s) => (
              <option key={s.id} value={s.name_ru}>
                {s.name_ru}
              </option>
            ))}
          </select>

          <select
            aria-label="Фильтр по состоянию"
            value={selectedCondition}
            onChange={(e) => setSelectedCondition(e.target.value)}
          >
            <option value="">Состояние</option>
            <option value="good">Хорошее</option>
            <option value="fair">Среднее</option>
            <option value="poor">Слабое</option>
          </select>
        </div>

        <div className="topbar-actions">
          <span className={`net-pill ${isOnline ? "online" : "offline"}`}>
            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            {isOnline ? "Онлайн" : "Офлайн"}
          </span>

          <button
            type="button"
            className={`btn-secondary ${bundleStatus.ready ? "btn-ready" : ""}`}
            onClick={() => setShowOfflinePanel(true)}
          >
            <CloudDownload size={16} />
            <span>
              {bundleStatus.ready ? "Офлайн ✓" : "Офлайн"}
              {pendingTrees.length > 0 ? ` (${pendingTrees.length})` : ""}
            </span>
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={16} /> Дерево
          </button>
        </div>
      </header>

      <main className="map-wrapper">
        <TreeMap trees={allVisibleTrees} onSelectTree={handleSelectTree} />
      </main>

      {toast && <div className="toast">{toast}</div>}

      {activeTree && (
        <TreePassportModal
          tree={activeTree}
          isOnline={isOnline}
          onClose={() => setActiveTree(null)}
          onUpdated={handleTreeUpdated}
        />
      )}

      {showAddModal && (
        <AddTreeModal
          speciesCatalog={speciesCatalog}
          isOnline={isOnline}
          onClose={() => setShowAddModal(false)}
          onCreated={async (savedOffline) => {
            setShowAddModal(false);
            await loadData();
            showToast(
              savedOffline
                ? "Дерево сохранено в память телефона (офлайн)"
                : "Паспорт дерева добавлен на карту"
            );
          }}
        />
      )}

      {showOfflinePanel && (
        <OfflinePanel
          status={bundleStatus}
          pendingCount={pendingTrees.length}
          isOnline={isOnline}
          onClose={() => setShowOfflinePanel(false)}
          onStatusChange={(next) => setBundleStatus(next)}
          onSyncNow={handleSyncNow}
        />
      )}
    </div>
  );
}
export default App;
