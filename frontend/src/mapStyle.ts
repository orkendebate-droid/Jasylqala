import type { StyleSpecification } from "maplibre-gl";

/** Максимальный масштаб тайлов OSM, который используем (на 18 видно отдельные деревья и дорожки). */
export const MAP_MAX_TILE_ZOOM = 18;

export const AKTAU_CENTER: [number, number] = [51.1605, 43.6532];

/** Общий растровый стиль OSM для основной карты и карты выбора точки. */
export const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: MAP_MAX_TILE_ZOOM,
      attribution: "© OpenStreetMap",
    },
  },
  layers: [{ id: "osm-tiles", type: "raster", source: "osm" }],
};
