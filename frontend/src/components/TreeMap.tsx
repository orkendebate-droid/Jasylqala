import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Compass } from "lucide-react";
import type { Tree } from "../types";

interface TreeMapProps {
  trees: Tree[];
  onSelectTree: (tree: Tree) => void;
}

const CONDITION_COLORS: Record<string, string> = {
  good: "#16a34a",
  fair: "#eab308",
  poor: "#dc2626",
};

export function TreeMap({ trees, onSelectTree }: TreeMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            maxzoom: 14,
            attribution: "© OpenStreetMap",
          },
        },
        layers: [
          {
            id: "osm-tiles",
            type: "raster",
            source: "osm",
          },
        ],
      },
      center: [51.1605, 43.6532],
      zoom: 13.5,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "bottom-right"
    );


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
      center: [51.1605, 43.6532],
      zoom: 13.5,
      essential: true,
    });
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
      </div>
    </div>
  );
}
