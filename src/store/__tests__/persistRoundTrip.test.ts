import { describe, it, expect, beforeEach } from "vitest";
import { get as idbGet, set as idbSet, clear as idbClear } from "idb-keyval";
import { useAppStore, STORE_NAME, flushPersist } from "@/store";
import { createDefaultScenario } from "@/models/defaults";

// These tests exercise the actual zustand persist middleware against
// fake-indexeddb (installed by src/test/setup.ts). They cover what plain
// JSON round-trip tests cannot: the migrate hook, partialize, and
// rehydrate() against an existing IDB payload.

async function waitForHydration(): Promise<void> {
  if (useAppStore.persist.hasHydrated()) return;
  await new Promise<void>((resolve) => {
    const off = useAppStore.persist.onFinishHydration(() => {
      off();
      resolve();
    });
  });
}

beforeEach(async () => {
  await idbClear();
  // Reset in-memory store to slice defaults so tests don't bleed state.
  useAppStore.setState({ scenarios: [], activeScenarioId: null, wizardCompleted: false });
});

describe("persist middleware against fake-indexeddb", () => {
  it("partialize writes scenarios + wizardCompleted but excludes simulations", async () => {
    await waitForHydration();
    const s = createDefaultScenario("Persist Test");
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
      wizardCompleted: true,
      // Set an in-memory-only field that should NOT persist.
      simulations: {
        [s.id]: { status: "complete", fingerprint: null, progress: 1, result: null, error: null },
      },
    });

    // The persist middleware schedules a debounced write. Flush it
    // synchronously so the test doesn't depend on timer accuracy.
    await flushPersist();

    const persisted = await idbGet<string>(STORE_NAME);
    expect(persisted).toBeDefined();
    const parsed = JSON.parse(persisted!);
    expect(parsed.state.scenarios).toHaveLength(1);
    expect(parsed.state.scenarios[0].name).toBe("Persist Test");
    expect(parsed.state.wizardCompleted).toBe(true);
    expect(parsed.state.simulations).toBeUndefined();
  });

  it("rehydrate restores persisted state from IDB", async () => {
    await waitForHydration();
    const s = createDefaultScenario("Rehydrate Test");

    // Manually plant a v3-shaped payload in IDB
    const payload = {
      state: {
        scenarios: [s],
        activeScenarioId: s.id,
        wizardCompleted: true,
        sideNavCollapsed: true,
        tableDensity: "compact",
        defaultIterations: 5000,
      },
      version: 3,
    };
    await idbSet(STORE_NAME, JSON.stringify(payload));

    // Force a rehydrate
    await useAppStore.persist.rehydrate();

    const state = useAppStore.getState();
    expect(state.scenarios).toHaveLength(1);
    expect(state.scenarios[0].name).toBe("Rehydrate Test");
    expect(state.wizardCompleted).toBe(true);
    expect(state.sideNavCollapsed).toBe(true);
    expect(state.tableDensity).toBe("compact");
    expect(state.defaultIterations).toBe(5000);
  });

  it("v2 → v3 migration backfills endsAtRetirement on wage-like income", async () => {
    await waitForHydration();
    // Construct a scenario whose IncomeSource lacks the v3 endsAtRetirement
    // field, simulating a legacy persisted shape.
    const s = createDefaultScenario("Migration Test");
    const v2Income = {
      id: "wage-1",
      owner: "self",
      label: "Salary",
      type: "salary",
      annualAmount: 100_000,
      startAge: 30,
      endAge: 65,
      inflationAdjusted: true,
      growthRate: 0.02,
      taxable: true,
      // endsAtRetirement deliberately omitted to mimic v2 data
    };
    const v2Payload = {
      state: {
        scenarios: [{ ...s, incomeSources: [v2Income] }],
        activeScenarioId: s.id,
        wizardCompleted: true,
        sideNavCollapsed: false,
        tableDensity: "comfortable",
        defaultIterations: 10000,
      },
      version: 2,
    };
    await idbSet(STORE_NAME, JSON.stringify(v2Payload));

    await useAppStore.persist.rehydrate();

    const state = useAppStore.getState();
    expect(state.scenarios).toHaveLength(1);
    const income = state.scenarios[0].incomeSources[0];
    // Salary is wage-like → endsAtRetirement was backfilled to true.
    expect(income.endsAtRetirement).toBe(true);
  });

  it("v1 payload is migrated through to v3 (the income backfill catches v1 too)", async () => {
    await waitForHydration();
    const s = createDefaultScenario("V1 Migration Test");
    const v1Income = {
      id: "wage-1",
      owner: "self",
      label: "Self-Employment",
      type: "self_employment",
      annualAmount: 80_000,
      startAge: 30,
      endAge: 65,
      inflationAdjusted: true,
      growthRate: 0.02,
      taxable: true,
    };
    const v1Payload = {
      state: {
        scenarios: [{ ...s, incomeSources: [v1Income] }],
        activeScenarioId: s.id,
        wizardCompleted: true,
        sideNavCollapsed: false,
        tableDensity: "comfortable",
        defaultIterations: 10000,
      },
      version: 1,
    };
    await idbSet(STORE_NAME, JSON.stringify(v1Payload));

    await useAppStore.persist.rehydrate();

    const state = useAppStore.getState();
    const income = state.scenarios[0].incomeSources[0];
    // self_employment is wage-like → endsAtRetirement backfilled.
    expect(income.endsAtRetirement).toBe(true);
  });

  it("future-version payload (v99) is rejected; store falls back to defaults", async () => {
    await waitForHydration();
    const futurePayload = {
      state: {
        scenarios: [createDefaultScenario("Future Scenario")],
        activeScenarioId: "future-id",
        wizardCompleted: true,
        sideNavCollapsed: false,
        tableDensity: "compact",
        defaultIterations: 10000,
      },
      version: 99,
    };
    await idbSet(STORE_NAME, JSON.stringify(futurePayload));

    // The migrate callback throws on version > 3. zustand's persist
    // middleware catches the throw and reverts to slice defaults rather
    // than continuing with the unmigrated payload.
    await useAppStore.persist.rehydrate();

    const state = useAppStore.getState();
    expect(state.scenarios.find((s) => s.name === "Future Scenario")).toBeUndefined();
  });
});
