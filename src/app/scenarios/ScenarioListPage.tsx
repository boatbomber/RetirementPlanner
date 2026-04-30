import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Copy, Trash2, Pencil, Star, BarChart3, GitCompareArrows } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "@/store";
import { Button, Card, EmptyState, Modal } from "@/components/primitives";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatPercent5pp } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Scenario, UUID } from "@/models";

function successColor(rate: number | undefined): string {
  if (rate == null) return "var(--color-text-tertiary)";
  if (rate >= 0.8) return "var(--color-success)";
  if (rate >= 0.6) return "var(--color-warning)";
  return "var(--color-danger)";
}

export function ScenarioListPage() {
  const navigate = useNavigate();
  const scenarios = useAppStore((s) => s.scenarios);
  const activeScenarioId = useAppStore((s) => s.activeScenarioId);
  // Subscribe only to per-scenario success rates so progress ticks (which
  // mutate the simulations record) don't re-render every card.
  const successRates = useAppStore(
    useShallow((s) =>
      Object.fromEntries(s.scenarios.map((scn) => [scn.id, s.simulations[scn.id]?.result?.successRate])),
    ),
  );
  const addScenario = useAppStore((s) => s.addScenario);
  const deleteScenario = useAppStore((s) => s.deleteScenario);
  const duplicateScenario = useAppStore((s) => s.duplicateScenario);
  const setActiveScenario = useAppStore((s) => s.setActiveScenario);
  const setBaseline = useAppStore((s) => s.setBaseline);

  const [deleteTarget, setDeleteTarget] = useState<Scenario | null>(null);

  const handleNew = useCallback(() => {
    const s = addScenario();
    setActiveScenario(s.id);
    navigate("/scenario/profile");
  }, [addScenario, setActiveScenario, navigate]);

  const handleDuplicate = useCallback(
    (id: UUID) => {
      const clone = duplicateScenario(id);
      if (clone) {
        setActiveScenario(clone.id);
      }
    },
    [duplicateScenario, setActiveScenario],
  );

  const handleDelete = useCallback(() => {
    if (deleteTarget) {
      deleteScenario(deleteTarget.id);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteScenario]);

  const handleEdit = useCallback(
    (id: UUID) => {
      setActiveScenario(id);
      navigate("/scenario/profile");
    },
    [setActiveScenario, navigate],
  );

  if (scenarios.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 size={40} />}
        title="No scenarios"
        description="Create your first scenario to start planning."
        action={<Button onClick={() => navigate("/wizard")}>Start wizard</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-[var(--space-7)]">
      <PageHeader
        title="Comparisons"
        subtitle="Manage and compare your retirement scenarios"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => navigate("/comparisons/compare")}
              icon={<GitCompareArrows size={16} />}
              disabled={scenarios.length < 2}
            >
              Compare
            </Button>
            <Button onClick={handleNew} icon={<Plus size={16} />}>
              New scenario
            </Button>
          </>
        }
      />

      <div className="grid gap-[var(--space-5)] sm:grid-cols-2 lg:grid-cols-3">
        {scenarios.map((s) => {
          const successRate = successRates[s.id];
          const isActive = s.id === activeScenarioId;

          return (
            <Card
              key={s.id}
              variant="surface"
              className={cn("flex flex-col overflow-hidden", isActive && "border-primary")}
            >
              <Button
                variant="ghost"
                onClick={() => setActiveScenario(s.id)}
                aria-label={`Select ${s.name}`}
                className="h-auto flex-1 flex-col items-start gap-[var(--space-2)] rounded-md px-[var(--space-5)] pt-[var(--space-5)] pb-[var(--space-4)] text-left hover:bg-[var(--color-surface-sunken)]"
              >
                <div className="flex items-center gap-[var(--space-3)]">
                  <span className="text-body font-semibold text-text-primary truncate">{s.name}</span>
                  {s.isBaseline && (
                    <Star size={12} className="shrink-0 fill-text-tertiary text-text-tertiary" />
                  )}
                </div>
                <span className="truncate text-body-sm text-text-tertiary">
                  {successRate != null ? (
                    <span className="font-semibold tabular-nums" style={{ color: successColor(successRate) }}>
                      {formatPercent5pp(successRate)}
                    </span>
                  ) : (
                    <span>Not simulated</span>
                  )}
                  {" · Retire at " +
                    s.profile.retirementAge +
                    " · " +
                    s.accounts.length +
                    " acct" +
                    (s.accounts.length !== 1 ? "s" : "")}
                </span>
              </Button>

              <div className="flex items-center gap-[var(--space-1)] border-t border-[var(--color-border-subtle)] px-[var(--space-3)] py-[var(--space-2)]">
                <Button
                  variant="icon-only"
                  size="sm"
                  onClick={() => handleEdit(s.id)}
                  aria-label="Edit scenario"
                  icon={<Pencil size={14} />}
                />
                <Button
                  variant="icon-only"
                  size="sm"
                  onClick={() => handleDuplicate(s.id)}
                  aria-label="Duplicate scenario"
                  icon={<Copy size={14} />}
                />
                {!s.isBaseline && (
                  <Button
                    variant="icon-only"
                    size="sm"
                    onClick={() => setBaseline(s.id)}
                    aria-label="Set as baseline"
                    icon={<Star size={14} />}
                  />
                )}
                <Button
                  variant="icon-only"
                  size="sm"
                  onClick={() => setDeleteTarget(s)}
                  aria-label="Delete scenario"
                  className="ml-auto hover:text-[var(--color-danger)]"
                  icon={<Trash2 size={14} />}
                />
              </div>
            </Card>
          );
        })}
      </div>

      <Modal
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete scenario"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
      >
        <div className="flex justify-end gap-[var(--space-3)] pt-[var(--space-5)]">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
