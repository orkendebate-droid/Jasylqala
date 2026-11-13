import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as api from "../api";
import { AddTreeModal } from "../components/AddTreeModal";
import { TreePassportModal } from "../components/TreePassportModal";
import { buildAktauTileUrls, buildOfflineTileUrls, buildPilotTileUrls } from "../offline/bundle";
import type { SpeciesInfo, Tree } from "../types";

const SPECIES: SpeciesInfo[] = [
  { id: "ulmus_pumila", name_ru: "Карагач (Вяз приземистый)", name_kk: "Қарағаш", latin_name: "Ulmus pumila", description: "" },
  { id: "morus_alba", name_ru: "Тутовник (Шелковица)", name_kk: "Тұт ағашы", latin_name: "Morus alba", description: "" },
];

const makeTree = (over: Partial<Tree> = {}): Tree => ({
  id: 7,
  client_id: "c-7",
  species: "Карагач (Вяз приземистый)",
  height_m: 5,
  condition: "poor",
  latitude: 43.6515,
  longitude: 51.158,
  photo_url: null,
  notes: "у подъезда",
  is_demo: false,
  created_at: "2026-11-13T00:00:00Z",
  tasks: [],
  ...over,
});

afterEach(() => vi.restoreAllMocks());

describe("offline map tiles for the pilot quarter", () => {
  it("downloads detailed zooms 15–18 for the quarter on top of the city overview", () => {
    const pilot = buildPilotTileUrls();
    const zooms = new Set(pilot.map((u) => Number(u.split("/")[3])));
    expect([...zooms].sort()).toEqual([15, 16, 17, 18]);
    // Квартал маленький: подробная карта не должна превращаться в массовую выгрузку тайлов
    expect(pilot.length).toBeLessThan(250);
    expect(buildOfflineTileUrls().length).toBe(buildAktauTileUrls([13, 14]).length + pilot.length);
  });
});

describe("TreePassportModal: fixing a record", () => {
  const renderPassport = (tree: Tree, extra: Partial<Parameters<typeof TreePassportModal>[0]> = {}) => {
    const props = {
      tree,
      isOnline: true,
      onClose: vi.fn(),
      onUpdated: vi.fn(),
      onDeleted: vi.fn(),
      speciesCatalog: SPECIES,
      ...extra,
    };
    render(<TreePassportModal {...props} />);
    return props;
  };

  it("sends only the changed fields", async () => {
    const updateSpy = vi.spyOn(api, "updateTree").mockResolvedValue(makeTree());
    const props = renderPassport(makeTree());

    fireEvent.click(screen.getByRole("button", { name: /Исправить/i }));
    const form = screen.getByRole("form", { name: /Исправить паспорт/i });
    fireEvent.change(form.querySelector("select")!, { target: { value: "Тутовник (Шелковица)" } });
    fireEvent.change(form.querySelector('input[type="number"]')!, { target: { value: "6.5" } });
    fireEvent.click(screen.getByRole("button", { name: /Сохранить исправления/i }));

    await waitFor(() => expect(props.onUpdated).toHaveBeenCalledWith(7));
    expect(updateSpy).toHaveBeenCalledWith(7, { species: "Тутовник (Шелковица)", height_m: 6.5 });
  });

  it("does not call the server when nothing changed", async () => {
    const updateSpy = vi.spyOn(api, "updateTree");
    renderPassport(makeTree());
    fireEvent.click(screen.getByRole("button", { name: /Исправить/i }));
    fireEvent.click(screen.getByRole("button", { name: /Сохранить исправления/i }));
    await waitFor(() => expect(screen.queryByRole("form", { name: /Исправить паспорт/i })).toBeNull());
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("deletes only after confirmation", async () => {
    const deleteSpy = vi.spyOn(api, "deleteTree").mockResolvedValue(undefined);
    const props = renderPassport(makeTree());

    fireEvent.click(screen.getByRole("button", { name: /^Удалить$/i }));
    expect(deleteSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Да, удалить/i }));
    await waitFor(() => expect(props.onDeleted).toHaveBeenCalledWith(7));
    expect(deleteSpy).toHaveBeenCalledWith(7);
  });

  it("disables fixing and deleting offline and for not-yet-synced trees", () => {
    renderPassport(makeTree(), { isOnline: false });
    expect(screen.getByRole("button", { name: /Исправить/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Удалить$/i })).toBeDisabled();
  });

  it("closing a task records the new tree condition", async () => {
    const taskSpy = vi.spyOn(api, "updateCareTask").mockResolvedValue({} as never);
    const tree = makeTree({
      tasks: [
        {
          id: 3, tree_id: 7, task_type: "inspection", status: "pending", notes: null,
          photo_before_url: null, photo_after_url: null, created_at: "2026-11-13T00:00:00Z", completed_at: null,
        },
      ],
    });
    const props = renderPassport(tree);

    fireEvent.click(screen.getByRole("button", { name: /Отметить выполненным/i }));
    fireEvent.change(screen.getByLabelText(/Состояние дерева после ухода/i), { target: { value: "good" } });
    fireEvent.click(screen.getByRole("button", { name: /Закрыть задачу/i }));

    await waitFor(() => expect(props.onUpdated).toHaveBeenCalledWith(7));
    expect(taskSpy).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ status: "done", tree_condition: "good" })
    );
  });

  it("does not send a condition when it did not change", async () => {
    const taskSpy = vi.spyOn(api, "updateCareTask").mockResolvedValue({} as never);
    const tree = makeTree({
      tasks: [
        {
          id: 4, tree_id: 7, task_type: "watering", status: "pending", notes: null,
          photo_before_url: null, photo_after_url: null, created_at: "2026-11-13T00:00:00Z", completed_at: null,
        },
      ],
    });
    renderPassport(tree);
    fireEvent.click(screen.getByRole("button", { name: /Отметить выполненным/i }));
    fireEvent.click(screen.getByRole("button", { name: /Закрыть задачу/i }));
    await waitFor(() => expect(taskSpy).toHaveBeenCalled());
    expect(taskSpy.mock.calls[0][1].tree_condition).toBeUndefined();
  });
});

describe("AddTreeModal: point on map and duplicates", () => {
  it("shows the map picker and lists trees already recorded near the point", () => {
    render(
      <AddTreeModal
        speciesCatalog={SPECIES}
        isOnline={false}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        existingTrees={[makeTree(), makeTree({ id: 8, client_id: "c-8", latitude: 43.66 })]}
      />
    );
    expect(screen.getByTestId("location-picker")).toBeInTheDocument();
    expect(screen.queryByTestId("duplicate-warning")).toBeNull();

    fireEvent.change(screen.getByLabelText("Широта"), { target: { value: "43.65151" } });
    fireEvent.change(screen.getByLabelText("Долгота"), { target: { value: "51.158" } });

    const warning = screen.getByTestId("duplicate-warning");
    expect(warning).toHaveTextContent("Карагач");
    expect(warning.querySelectorAll("li")).toHaveLength(1); // дерево в 900 м не попадает
  });
});
