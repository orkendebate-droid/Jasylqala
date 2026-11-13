import { describe, expect, it } from "vitest";
import { duplicateRadiusM, findNearbyTrees, isInPilot, pilotStats } from "../pilot";
import type { Tree } from "../types";

const tree = (over: Partial<Tree>): Tree => ({
  id: 1, client_id: null, species: "Карагач", height_m: 5, condition: "good",
  latitude: 43.6515, longitude: 51.158, photo_url: null, notes: null,
  is_demo: false, created_at: "2026-11-13T00:00:00Z", ...over,
});

describe("pilot quarter", () => {
  it("detects points inside and outside", () => {
    expect(isInPilot(43.6515, 51.158)).toBe(true);
    expect(isInPilot(43.66, 51.158)).toBe(false);
  });

  it("counts only real trees inside the quarter towards 300", () => {
    const s = pilotStats([
      tree({}),
      tree({ id: 2, is_demo: true }),
      tree({ id: 3, latitude: 43.7, condition: "poor" }),
      tree({ id: 4, condition: "poor" }),
    ]);
    expect(s.real).toBe(2);
    expect(s.total).toBe(3);
    expect(s.poor).toBe(1);
    expect(s.percent).toBe(1);
  });

  it("lists possible duplicates within the GPS accuracy radius, nearest first", () => {
    const existing = [
      tree({ id: 1 }),
      tree({ id: 2, latitude: 43.65156 }), // ~7 м
      tree({ id: 3, latitude: 43.652 }), // ~55 м
    ];
    // точка ~1 м от дерева 1
    const near = findNearbyTrees(existing, 43.65151, 51.158, 5);
    expect(near.map((n) => n.tree.id)).toEqual([1]);

    const wide = findNearbyTrees(existing, 43.65151, 51.158, 15);
    expect(wide.map((n) => n.tree.id)).toEqual([1, 2]);
    expect(wide[0].distance).toBeLessThan(wide[1].distance);
  });

  it("uses GPS accuracy as the duplicate radius, clamped to 5–20 m", () => {
    expect(duplicateRadiusM(null)).toBe(5); // точка поставлена на карте
    expect(duplicateRadiusM(3)).toBe(5);
    expect(duplicateRadiusM(12)).toBe(12);
    expect(duplicateRadiusM(80)).toBe(20);
  });
});
