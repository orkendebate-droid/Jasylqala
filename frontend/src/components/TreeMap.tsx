import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Compass, Target } from "lucide-react";
import type { Tree } from "../types";
import { PILOT, PILOT_BOUNDS, type PilotStats } from "../pilot";
import { AKTAU_CENTER, OSM_STYLE } from "../mapStyle";

interface TreeMapProps {
  trees: Tree[];
  onSelectTree: (tree: Tree) => void;
  /** Прогресс пилотного квартала (считается по всем деревьям, без учёта фильтров) */
  pilot?: PilotStats;
}

const CONDITION_COLORS: Record<string, string> = {
  good: "#16a34a",
  fair: "#eab308",
  poor: "#dc2626",
};

export function TreeMap({ trees, onSelectTree, pilot }: TreeMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: AKTAU_CENTER,
      zoom: 13.5,
      maxZoom: 19,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "bottom-right"
    );

    map.on("load", () => {
      map.addSource("pilot", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: { name: PILOT.name },
          geometry: { type: "Polygon", coordinates: [PILOT.polygon] },
        },
      });
      map.addLayer({
        id: "pilot-fill",
        type: "fill",
        source: "pilot",
        paint: { "fill-color": "#15803d", "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: "pilot-outline",
        type: "line",
        source: "pilot",
        paint: { "line-color": "#15803d", "line-width": 2.5, "line-dasharray": [2, 1.5] },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    trees.forEach((tree) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `tree-marker ${tree.id < 0 ? "pending-marker" : ""}`;
      el.title = `${tree.species} (${tree.height_m} м) • ${tree.condition}`;
      el.style.backgroundColor = CONDITION_COLORS[tree.condition] || "#16a34a";
      el.style.border = tree.id < 0 ? "3px dashed #ffffff" : "2px solid #ffffff";
      el.onclick = () => onSelectTree(tree);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([tree.longitude, tree.latitude])
        .addTo(map);
      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [trees, onSelectTree]);

  const handleCenterAktau = () => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: AKTAU_CENTER,
      zoom: 13.5,
      essential: true,
    });
  };

  const handleFlyToPilot = () => {
    mapRef.current?.fitBounds(PILOT_BOUNDS, { padding: 60, maxZoom: 17 });
  };

  return (
    <div className="map-container" data-testid="tree-map">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Floating map HUD: Legend & Total stats */}
      <div className="map-hud-top">
        <div className="map-hud-card">
          <span style={{ fontWeight: 700, color: "var(--color-primary)" }}>
            Ақтау • {trees.length} дер.
          </span>
          <div className="legend-item">
            <span className="legend-dot" style={{ background: "#16a34a" }} />
            <span>Хор.</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ background: "#eab308" }} />
            <span>Ср.</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ background: "#dc2626" }} />
            <span>Слаб.</span>
          </div>
        </div>

        {pilot && (
          <div className="map-hud-card pilot-card" data-testid="pilot-progress">
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: 8 }}>
              <strong>Пилот · {PILOT.name}</strong>
              <span>
                <strong>{pilot.real}</strong> / {PILOT.target}
              </span>
            </div>
            <div className="progress-bar" aria-label={`Пилот: ${pilot.percent}%`}>
              <div className="progress-fill" style={{ width: `${pilot.percent}%` }} />
            </div>
            {pilot.poor > 0 && (
              <span style={{ color: "#dc2626" }}>Слабых в квартале: {pilot.poor}</span>
            )}
          </div>
        )}
      </div>

      {/* Re-center button */}
      <div className="map-hud-bottom">
        <button
          type="button"
          className="btn-map-control"
          onClick={handleCenterAktau}
          title="Вернуться к центру Актау"
        >
          <Compass size={16} /> Центр города
        </button>
        <button
          type="button"
          className="btn-map-control"
          onClick={handleFlyToPilot}
          title="Показать пилотный квартал"
        >
          <Target size={16} /> Пилот
        </button>
      </div>
    </div>
  );
}
