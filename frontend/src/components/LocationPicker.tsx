import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Tree } from "../types";
import { PILOT, PILOT_BOUNDS } from "../pilot";
import { OSM_STYLE } from "../mapStyle";

interface LocationPickerProps {
  /** Текущая точка; null — координат ещё нет */
  lat: number | null;
  lon: number | null;
  /** Точность GPS в метрах — рисуется кругом вокруг метки; null, если точку поставили вручную */
  accuracy?: number | null;
  /** Уже внесённые деревья — показываются точками, чтобы было видно соседей */
  trees?: Tree[];
  /** Пользователь передвинул метку или ткнул в карту */
  onPick: (lat: number, lon: number) => void;
}

const PICK_ZOOM = 18;

const emptyFc = (): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features: [] });

/** Круг радиусом radiusM вокруг точки (полигон из 48 вершин). */
function accuracyCircle(lat: number, lon: number, radiusM: number): GeoJSON.FeatureCollection {
  const ring: [number, number][] = [];
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * 2 * Math.PI;
    ring.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }],
  };
}

const treesFc = (trees: Tree[]): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: trees.map((t) => ({
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: [t.longitude, t.latitude] },
  })),
});

/**
 * Маленькая карта для уточнения точки дерева.
 * GPS телефона ошибается на 5–15 м, а деревья в аллее стоят через 3–5 м,
 * поэтому метку можно перетащить или просто ткнуть в нужное место.
 */
const NO_TREES: Tree[] = [];

export function LocationPicker({ lat, lon, accuracy = null, trees = NO_TREES, onPick }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const loadedRef = useRef(false);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const [failed, setFailed] = useState(false);

  // Последние значения — чтобы применить их, когда карта догрузится
  const latest = useRef({ lat, lon, accuracy, trees });
  latest.current = { lat, lon, accuracy, trees };

  const applyPoint = () => {
    const map = mapRef.current;
    if (!map) return;
    const { lat: la, lon: lo, accuracy: acc } = latest.current;

    if (la === null || lo === null) {
      markerRef.current?.remove();
      markerRef.current = null;
    } else {
      if (!markerRef.current) {
        const marker = new maplibregl.Marker({ draggable: true, color: "#15803d" })
          .setLngLat([lo, la])
          .addTo(map);
        marker.on("dragend", () => {
          const p = marker.getLngLat();
          onPickRef.current(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)));
        });
        markerRef.current = marker;
        map.jumpTo({ center: [lo, la], zoom: PICK_ZOOM });
      } else {
        markerRef.current.setLngLat([lo, la]);
        // Метка ушла за край видимой области (GPS уточнился) — возвращаем её в кадр
        if (!map.getBounds().contains([lo, la])) map.easeTo({ center: [lo, la] });
      }
    }

    if (loadedRef.current) {
      const src = map.getSource("accuracy") as maplibregl.GeoJSONSource | undefined;
      src?.setData(la !== null && lo !== null && acc ? accuracyCircle(la, lo, acc) : emptyFc());
    }
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: OSM_STYLE,
        bounds: PILOT_BOUNDS,
        fitBoundsOptions: { padding: 20 },
        maxZoom: 19,
        attributionControl: false,
      });
    } catch {
      // Нет WebGL (старый телефон) — форма остаётся рабочей, координаты вводятся вручную/по GPS
      setFailed(true);
      return;
    }
    mapRef.current = map;

    map.on("load", () => {
      loadedRef.current = true;
      map.addSource("pilot", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [PILOT.polygon] },
        },
      });
      map.addLayer({
        id: "pilot-outline",
        type: "line",
        source: "pilot",
        paint: { "line-color": "#15803d", "line-width": 2, "line-dasharray": [2, 1.5] },
      });
      map.addSource("accuracy", { type: "geojson", data: emptyFc() });
      map.addLayer({
        id: "accuracy-fill",
        type: "fill",
        source: "accuracy",
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.12 },
      });
      map.addSource("trees", { type: "geojson", data: treesFc(latest.current.trees) });
      map.addLayer({
        id: "trees-dots",
        type: "circle",
        source: "trees",
        paint: {
          "circle-radius": 5,
          "circle-color": "#f97316",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });
      applyPoint();
    });

    map.on("click", (e) => {
      onPickRef.current(Number(e.lngLat.lat.toFixed(6)), Number(e.lngLat.lng.toFixed(6)));
    });

    applyPoint();

    return () => {
      loadedRef.current = false;
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyPoint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, accuracy]);

  useEffect(() => {
    if (!loadedRef.current) return;
    const src = mapRef.current?.getSource("trees") as maplibregl.GeoJSONSource | undefined;
    src?.setData(treesFc(trees));
  }, [trees]);

  if (failed) return null;

  return (
    <div className="location-picker" data-testid="location-picker">
      <div ref={containerRef} className="location-picker-map" />
      <span className="muted location-picker-hint">
        Перетащите метку или нажмите на карту, чтобы поставить точку точно на дерево.
        Оранжевые точки — уже внесённые деревья.
      </span>
    </div>
  );
}
