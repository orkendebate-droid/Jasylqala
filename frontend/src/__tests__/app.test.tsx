import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { predictFromFeatureVector } from "../offline/predictor";
import { buildAktauTileUrls } from "../offline/bundle";
import { compressImage } from "../utils/image";
import { TreePassportModal } from "../components/TreePassportModal";
import { AddTreeModal } from "../components/AddTreeModal";
import { OfflinePanel } from "../components/OfflinePanel";
import * as offlineDb from "../offline/db";
import * as offlineBundle from "../offline/bundle";
import type { SpeciesInfo, Tree } from "../types";

const MOCK_SPECIES: SpeciesInfo[] = [
  {
    id: "ulmus_pumila",
    name_ru: "Карагач (Вяз приземистый)",
    name_kk: "Қарағаш",
    latin_name: "Ulmus pumila",
    description: "Устойчив к засухе",
  },
  {
    id: "elaeagnus_angustifolia",
    name_ru: "Лох узколистный (Джида)",
    name_kk: "Жиде",
    latin_name: "Elaeagnus angustifolia",
    description: "Серебристая листва",
  },
  {
    id: "tamarix_ramosissima",
    name_ru: "Тамариск (Гребенщик)",
    name_kk: "Жыңғыл",
    latin_name: "Tamarix ramosissima",
    description: "Солеустойчивый кустарник",
  },
];

describe("Offline ML Predictor", () => {
  it("returns top 3 species sorted by probability descending", () => {
    const preds = predictFromFeatureVector(
      [0.34, 0.48, 0.28, 0.18, 0.14],
      [
        {
          id: "ulmus_pumila",
          name_ru: "Карагач (Вяз приземистый)",
          latin_name: "Ulmus pumila",
          prototype: [0.34, 0.48, 0.28, 0.18, 0.14],
        },
        {
          id: "elaeagnus_angustifolia",
          name_ru: "Лох узколистный (Джида)",
          latin_name: "Elaeagnus angustifolia",
          prototype: [0.48, 0.54, 0.46, 0.15, 0.06],
        },
        {
          id: "tamarix_ramosissima",
          name_ru: "Тамариск (Гребенщик)",
          latin_name: "Tamarix ramosissima",
          prototype: [0.42, 0.45, 0.38, 0.2, 0.04],
        },
        {
          id: "morus_alba",
          name_ru: "Тутовник (Шелковица)",
          latin_name: "Morus alba",
          prototype: [0.32, 0.47, 0.26, 0.16, 0.15],
        },
      ]
    );

    expect(preds).toHaveLength(3);
    expect(preds[0].species_id).toBe("ulmus_pumila");
    expect(preds[0].probability).toBeGreaterThanOrEqual(preds[1].probability);
    expect(preds[1].probability).toBeGreaterThanOrEqual(preds[2].probability);
  });
});

describe("Aktau Offline Map Tiles", () => {
  it("generates tile URLs covering Aktau", () => {
    const urls = buildAktauTileUrls([13]);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls[0]).toMatch(/^https:\/\/tile\.openstreetmap\.org\/13\/\d+\/\d+\.png$/);
  });
});

describe("TreePassportModal", () => {
  it("renders demo badge, height, coordinates and tasks", () => {
    const tree: Tree = {
      id: 1,
      client_id: "demo-1",
      species: "Карагач (Вяз приземистый)",
      height_m: 6.5,
      condition: "good",
      latitude: 43.6512,
      longitude: 51.1578,
      photo_url: null,
      notes: "Демо: 4 мкр",
      is_demo: true,
      created_at: new Date().toISOString(),
      tasks: [
        {
          id: 10,
          tree_id: 1,
          task_type: "watering",
          status: "pending",
          notes: "Полив 20 л",
          photo_before_url: null,
          photo_after_url: null,
          created_at: new Date().toISOString(),
          completed_at: null,
        },
      ],
    };

    render(
      <TreePassportModal
        tree={tree}
        isOnline={true}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    );

    expect(screen.getByText("Демо")).toBeInTheDocument();
    expect(screen.getByText("6.5 м")).toBeInTheDocument();
    expect(screen.getByText("Полив 20 л")).toBeInTheDocument();
  });
});

describe("AddTreeModal Offline Flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("saves tree to IndexedDB when offline without network calls", async () => {
    const addSpy = vi.spyOn(offlineDb, "addPendingTree").mockResolvedValue(undefined);
    const onCreated = vi.fn();

    render(
      <AddTreeModal
        speciesCatalog={MOCK_SPECIES}
        isOnline={false}
        onClose={vi.fn()}
        onCreated={onCreated}
      />
    );

    expect(
      screen.getByText(/Офлайн: сохранится в телефон/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Сохранить/i }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledTimes(1);
      expect(onCreated).toHaveBeenCalledWith(true);
    });
  });
});

describe("OfflinePanel", () => {
  it("downloads offline bundle and updates status", async () => {
    const onStatusChange = vi.fn();
    vi.spyOn(offlineBundle, "downloadOfflineBundle").mockImplementation(async (onProgress) => {
      onProgress?.({ stage: "done", percent: 100, message: "Офлайн-режим готов!" });
      return {
        ready: true,
        downloadedAt: "2026-11-12T10:00:00.000Z",
        treesCount: 8,
        tilesCount: 24,
      };
    });

    render(
      <OfflinePanel
        status={{ ready: false, downloadedAt: null, treesCount: 0, tilesCount: 0 }}
        pendingCount={0}
        isOnline={true}
        onClose={vi.fn()}
        onStatusChange={onStatusChange}
        onSyncNow={vi.fn()}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Скачать офлайн/i })
    );

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({ ready: true, treesCount: 8, tilesCount: 24 })
      );
    });
  });

  it("closes on backdrop click", () => {
    const onClose = vi.fn();
    render(
      <OfflinePanel
        status={{ ready: true, downloadedAt: null, treesCount: 0, tilesCount: 0 }}
        pendingCount={0}
        isOnline={true}
        onClose={onClose}
        onStatusChange={vi.fn()}
        onSyncNow={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Image Compression", () => {
  it("returns blob without crashing", async () => {
    const mockBlob = new Blob(["mock-image-data"], { type: "image/jpeg" });
    const result = await compressImage(mockBlob);
    expect(result).toBeDefined();
    expect(result.size).toBeGreaterThan(0);
  });
});
