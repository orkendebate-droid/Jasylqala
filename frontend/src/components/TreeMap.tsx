import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
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
      el.className = "tree-marker";
      el.title = `${tree.species} (${tree.height_m} м)`;
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

  return <div ref={containerRef} className="map-container" data-testid="tree-map" />;
}
