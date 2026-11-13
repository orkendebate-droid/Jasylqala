import { describe, expect, it } from "vitest";
import { findNearbyTree, isInPilot, pilotStats } from "../pilot";
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

  it("warns about a tree within 3 m, not 10 m", () => {
    const existing = [tree({})];
    expect(findNearbyTree(existing, 43.65151, 51.158)).not.toBeNull(); // ~1 м
    expect(findNearbyTree(existing, 43.6516, 51.158)).toBeNull(); // ~11 м
  });
});
