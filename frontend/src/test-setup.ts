import "@testing-library/jest-dom";
import { vi } from "vitest";

// MapLibre требует WebGL, которого нет в jsdom. Подменяем минимальной заглушкой,
// чтобы компоненты с картой можно было рендерить в тестах.
vi.mock("maplibre-gl", () => {
  class FakeMap {
    on() {
      return this;
    }
    addControl() {
      return this;
    }
    addSource() {}
    addLayer() {}
    getSource() {
      return undefined;
    }
    getBounds() {
      return { contains: () => true };
    }
    jumpTo() {}
    easeTo() {}
    flyTo() {}
    fitBounds() {}
    remove() {}
  }
  class FakeMarker {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    on() {
      return this;
    }
    getLngLat() {
      return { lat: 0, lng: 0 };
    }
    remove() {}
  }
  class FakeControl {}
  return {
    default: {
      Map: FakeMap,
      Marker: FakeMarker,
      NavigationControl: FakeControl,
      GeolocateControl: FakeControl,
    },
  };
});
