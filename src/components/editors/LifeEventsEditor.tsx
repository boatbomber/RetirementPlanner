import { useState, useCallback } from "react";
import { X, Plus, ChevronDown, ChevronUp } from "lucide-react";
import type { EditorProps } from "./types";
import type { LifeEvent, FinancialImpact, IncomeChange, ExpenseChange, ContributionChange } from "@/models";
import { FieldShell } from "@/components/primitives/Input/FieldShell";
import { TextInput } from "@/components/primitives/Input/TextInput";
import { Select } from "@/components/primitives/Input/Select";
import { LabeledSwitch } from "@/components/primitives/Input/Switch";
import { Button } from "@/components/primitives/Button";
import { Card } from "@/components/primitives/Card";
import { formatCurrency } from "@/lib/format";
import {
  LIFE_EVENT_TEMPLATES,
  type LifeEventTemplate,
  getEventIcon,
} from "@/components/charts/lifeEventStyles";

function emptyImpact(): FinancialImpact {
  return {
    oneTimeInflow: 0,
    oneTimeOutflow: 0,
    targetAccountId: null,
    incomeChanges: [],
    expenseChanges: [],
    contributionChanges: [],
  };
}

function createEventFromTemplate(t: LifeEventTemplate): LifeEvent {
  return {
    id: crypto.randomUUID(),
    type: t.type,
    label: t.label,
    description: t.defaults.description,
    triggerAge: t.defaults.triggerAge,
    durationYears: t.defaults.durationYears,
    financialImpact: { ...emptyImpact(), ...t.defaults.financialImpact },
    iconKey: t.id,
  };
}

function impactSummary(e: LifeEvent): string {
  const parts: string[] = [];
  if (e.financialImpact.oneTimeInflow > 0) parts.push(`+${formatCurrency(e.financialImpact.oneTimeInflow)}`);
  if (e.financialImpact.oneTimeOutflow > 0)
    parts.push(`-${formatCurrency(e.financialImpact.oneTimeOutflow)}`);
  if (e.financialImpact.incomeChanges.length > 0) {
    for (const ic of e.financialImpact.incomeChanges) {
      if (ic.newIncome.annualAmount != null) {
        parts.push(
          ic.existingIncomeId
            ? `salary → ${formatCurrency(ic.newIncome.annualAmount)}/yr`
            : `+${formatCurrency(ic.newIncome.annualAmount)}/yr income`,
        );
      }
    }
  }
  if (e.financialImpact.expenseChanges.length > 0) {
    for (const ec of e.financialImpact.expenseChanges) {
      if (ec.newExpense.annualAmount != null) {
        parts.push(`+${formatCurrency(ec.newExpense.annualAmount)}/yr expense`);
      }
    }
  }
  if (e.financialImpact.contributionChanges.length > 0) {
    parts.push(`${e.financialImpact.contributionChanges.length} contribution change(s)`);
  }
  if (e.durationYears) parts.push(`${e.durationYears} year${e.durationYears > 1 ? "s" : ""}`);
  return parts.join(" · ") || "No financial impact set";
}

export function LifeEventsEditor({ scenario, onUpdate }: EditorProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const updateEvents = useCallback(
    (events: LifeEvent[]) => {
      onUpdate({ lifeEvents: events });
    },
    [onUpdate],
  );

  const addEvent = useCallback(
    (template: LifeEventTemplate) => {
      const event = createEventFromTemplate(template);
      updateEvents([...scenario.lifeEvents, event]);
      setShowPicker(false);
      setExpandedId(event.id);
    },
    [scenario.lifeEvents, updateEvents],
  );

  const updateEvent = useCallback(
    (id: string, patch: Partial<LifeEvent>) => {
      updateEvents(scenario.lifeEvents.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    },
    [scenario.lifeEvents, updateEvents],
  );

  const updateEventImpact = useCallback(
    (id: string, patch: Partial<FinancialImpact>) => {
      const event = scenario.lifeEvents.find((e) => e.id === id);
      if (event) {
        updateEvent(id, {
          financialImpact: { ...event.financialImpact, ...patch },
        });
      }
    },
    [scenario.lifeEvents, updateEvent],
  );

  const removeEvent = useCallback(
    (id: string) => {
      updateEvents(scenario.lifeEvents.filter((e) => e.id !== id));
    },
    [scenario.lifeEvents, updateEvents],
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="flex flex-col gap-[var(--space-5)]">
      <p className="text-body-sm text-text-tertiary">
        Add anticipated life changes that will affect your financial plan.
      </p>

      {scenario.lifeEvents
        .slice()
        .sort((a, b) => a.triggerAge - b.triggerAge)
        .map((event) => (
          <EventCard
            key={event.id}
            event={event}
            scenario={scenario}
            expanded={expandedId === event.id}
            onToggleExpand={() => toggleExpanded(event.id)}
            onUpdate={updateEvent}
            onUpdateImpact={updateEventImpact}
            onRemove={() => removeEvent(event.id)}
          />
        ))}

      {!showPicker ? (
        <Button variant="secondary" onClick={() => setShowPicker(true)} icon={<Plus size={16} />}>
          Add Life Event
        </Button>
      ) : (
        <Card variant="sunken" className="flex flex-col gap-[var(--space-4)] p-[var(--space-5)]">
          <div className="flex items-center justify-between">
            <span className="text-body-sm font-semibold text-text-primary">Choose a template</span>
            <Button
              variant="icon-only"
              size="sm"
              onClick={() => setShowPicker(false)}
              aria-label="Close template picker"
              icon={<X size={16} />}
            />
          </div>
          <div className="grid grid-cols-2 gap-[var(--space-3)]">
            {LIFE_EVENT_TEMPLATES.map((t, i) => (
              <Button
                key={i}
                variant="secondary"
                onClick={() => addEvent(t)}
                className="h-auto justify-start gap-[var(--space-3)] rounded-md px-[var(--space-4)] py-[var(--space-3)] text-body-sm hover:border-[var(--color-border-strong)] hover:bg-primary-soft"
              >
                <span className="shrink-0 text-text-tertiary">{t.icon}</span>
                {t.label}
              </Button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function EventCard({
  event,
  scenario,
  expanded,
  onToggleExpand,
  onUpdate,
  onUpdateImpact,
  onRemove,
}: {
  event: LifeEvent;
  scenario: EditorProps["scenario"];
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (id: string, patch: Partial<LifeEvent>) => void;
  onUpdateImpact: (id: string, patch: Partial<FinancialImpact>) => void;
  onRemove: () => void;
}) {
  return (
    <Card variant="surface" className="relative flex flex-col gap-[var(--space-4)] p-[var(--space-5)]">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          className="h-auto justify-start gap-[var(--space-3)] px-0 hover:bg-transparent"
        >
          {expanded ? (
            <ChevronUp size={14} className="text-text-tertiary" />
          ) : (
            <ChevronDown size={14} className="text-text-tertiary" />
          )}
          <span className="text-text-tertiary">{getEventIcon(event)}</span>
          <span className="text-body-sm font-medium text-text-primary">{event.label}</span>
          <span className="text-caption text-text-tertiary">
            Age {event.triggerAge}
            {event.durationYears ? `–${event.triggerAge + event.durationYears - 1}` : ""}
          </span>
        </Button>
        <Button
          variant="icon-only"
          size="md"
          onClick={onRemove}
          aria-label="Remove event"
          icon={<X size={16} />}
        />
      </div>

      {!expanded && <p className="text-caption text-text-tertiary">{impactSummary(event)}</p>}

      {expanded && (
        <>
          <FieldShell label="Event name">
            <TextInput value={event.label} onChange={(e) => onUpdate(event.id, { label: e.target.value })} />
          </FieldShell>

          <div className="grid grid-cols-2 gap-[var(--space-4)]">
            <FieldShell label="At age">
              <TextInput
                inputType="number"
                value={String(event.triggerAge)}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) onUpdate(event.id, { triggerAge: val });
                }}
              />
            </FieldShell>
            <FieldShell label="Duration (years)" helper="Leave blank for one-time or permanent">
              <TextInput
                inputType="number"
                value={event.durationYears != null ? String(event.durationYears) : ""}
                onChange={(e) => {
                  const val = e.target.value ? parseInt(e.target.value) : null;
                  onUpdate(event.id, {
                    durationYears: val !== null && !isNaN(val) ? val : null,
                  });
                }}
                placeholder="Permanent"
              />
            </FieldShell>
          </div>

          <div className="grid grid-cols-2 gap-[var(--space-4)]">
            <FieldShell label="One-time inflow">
              <TextInput
                inputType="currency"
                value={event.financialImpact.oneTimeInflow || ""}
                onChange={(e) => {
                  const val = parseFloat(e.target.value.replace(/[^0-9.-]/g, ""));
                  onUpdateImpact(event.id, {
                    oneTimeInflow: isNaN(val) ? 0 : val,
                  });
                }}
                placeholder="0"
              />
            </FieldShell>
            <FieldShell label="One-time outflow">
              <TextInput
                inputType="currency"
                value={event.financialImpact.oneTimeOutflow || ""}
                onChange={(e) => {
                  const val = parseFloat(e.target.value.replace(/[^0-9.-]/g, ""));
                  onUpdateImpact(event.id, {
                    oneTimeOutflow: isNaN(val) ? 0 : val,
                  });
                }}
                placeholder="0"
              />
            </FieldShell>
          </div>

          {(event.financialImpact.oneTimeInflow > 0 || event.financialImpact.oneTimeOutflow > 0) &&
            scenario.accounts.length > 0 && (
              <FieldShell
                label="Target account"
                helper="Where to deposit inflows / draw outflows from. Leave on Auto for default selection."
              >
                <Select
                  value={event.financialImpact.targetAccountId ?? "__auto__"}
                  onValueChange={(v) =>
                    onUpdateImpact(event.id, {
                      targetAccountId: v === "__auto__" ? null : v,
                    })
                  }
                  options={[
                    { value: "__auto__", label: "Auto (taxable / first cash account)" },
                    ...scenario.accounts.map((a) => ({
                      value: a.id,
                      label: a.label || a.type,
                    })),
                  ]}
                />
              </FieldShell>
            )}

          <IncomeChangesSection
            event={event}
            incomeSources={scenario.incomeSources}
            onUpdateImpact={onUpdateImpact}
          />

          <ExpenseChangesSection event={event} onUpdateImpact={onUpdateImpact} />

          <ContributionChangesSection
            event={event}
            accounts={scenario.accounts}
            onUpdateImpact={onUpdateImpact}
          />

          <p className="text-caption text-text-tertiary">{impactSummary(event)}</p>
        </>
      )}
    </Card>
  );
}

function IncomeChangesSection({
  event,
  incomeSources,
  onUpdateImpact,
}: {
  event: LifeEvent;
  incomeSources: EditorProps["scenario"]["incomeSources"];
  onUpdateImpact: (id: string, patch: Partial<FinancialImpact>) => void;
}) {
  const changes = event.financialImpact.incomeChanges;

  const addChange = () => {
    const newChange: IncomeChange = {
      existingIncomeId: null,
      newIncome: { annualAmount: 0 },
    };
    onUpdateImpact(event.id, { incomeChanges: [...changes, newChange] });
  };

  const updateChange = (idx: number, patch: Partial<IncomeChange>) => {
    const updated = changes.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onUpdateImpact(event.id, { incomeChanges: updated });
  };

  const removeChange = (idx: number) => {
    onUpdateImpact(event.id, {
      incomeChanges: changes.filter((_, i) => i !== idx),
    });
  };

  const incomeOptions = [
    { value: "__new__", label: "Add new income" },
    ...incomeSources.map((s) => ({ value: s.id, label: s.label })),
  ];

  return (
    <div className="flex flex-col gap-[var(--space-3)]">
      <div className="flex items-center justify-between">
        <span className="text-overline text-text-tertiary">Income Changes</span>
        <Button variant="ghost" size="sm" onClick={addChange} icon={<Plus size={12} />}>
          Add
        </Button>
      </div>
      {changes.map((change, idx) => (
        <Card key={idx} variant="sunken" className="flex flex-col gap-[var(--space-3)] p-[var(--space-4)]">
          <div className="flex items-center justify-between gap-[var(--space-2)]">
            <Select
              value={change.existingIncomeId ?? "__new__"}
              onValueChange={(v) =>
                updateChange(idx, {
                  existingIncomeId: v === "__new__" ? null : v,
                })
              }
              options={incomeOptions}
            />
            <Button
              variant="icon-only"
              size="sm"
              onClick={() => removeChange(idx)}
              aria-label="Remove income change"
              icon={<X size={14} />}
            />
          </div>
          <div className="grid grid-cols-2 gap-[var(--space-3)]">
            <FieldShell label="Annual amount">
              <TextInput
                inputType="currency"
                value={change.newIncome.annualAmount ?? ""}
                onChange={(e) => {
                  const val = parseFloat(e.target.value.replace(/[^0-9.-]/g, ""));
                  updateChange(idx, {
                    newIncome: {
                      ...change.newIncome,
                      annualAmount: isNaN(val) ? 0 : val,
                    },
                  });
                }}
                placeholder="0"
              />
            </FieldShell>
            <FieldShell label="Annual growth rate">
              <TextInput
                inputType="percent"
                value={
                  change.newIncome.growthRate != null
                    ? String(Math.round(change.newIncome.growthRate * 100 * 10) / 10)
                    : ""
                }
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  updateChange(idx, {
                    newIncome: {
                      ...change.newIncome,
                      growthRate: isNaN(val) ? 0 : val / 100,
                    },
                  });
                }}
                placeholder="2"
              />
            </FieldShell>
          </div>
          <LabeledSwitch
            checked={change.newIncome.taxable ?? true}
            onCheckedChange={(v) =>
              updateChange(idx, {
                newIncome: { ...change.newIncome, taxable: v },
              })
            }
            label="Taxable income"
          />
          <LabeledSwitch
            checked={change.newIncome.inflationAdjusted ?? true}
            onCheckedChange={(v) =>
              updateChange(idx, {
                newIncome: { ...change.newIncome, inflationAdjusted: v },
              })
            }
            label="Inflation-adjusted"
          />
        </Card>
      ))}
    </div>
  );
}

function ExpenseChangesSection({
  event,
  onUpdateImpact,
}: {
  event: LifeEvent;
  onUpdateImpact: (id: string, patch: Partial<FinancialImpact>) => void;
}) {
  const changes = event.financialImpact.expenseChanges;

  const addChange = () => {
    const newChange: ExpenseChange = {
      existingExpenseId: null,
      newExpense: { annualAmount: 0 },
    };
    onUpdateImpact(event.id, { expenseChanges: [...changes, newChange] });
  };

  const updateChange = (idx: number, patch: Partial<ExpenseChange["newExpense"]>) => {
    const updated = changes.map((c, i) =>
      i === idx ? { ...c, newExpense: { ...c.newExpense, ...patch } } : c,
    );
    onUpdateImpact(event.id, { expenseChanges: updated });
  };

  const removeChange = (idx: number) => {
    onUpdateImpact(event.id, {
      expenseChanges: changes.filter((_, i) => i !== idx),
    });
  };

  return (
    <div className="flex flex-col gap-[var(--space-3)]">
      <div className="flex items-center justify-between">
        <span className="text-overline text-text-tertiary">Expense Changes</span>
        <Button variant="ghost" size="sm" onClick={addChange} icon={<Plus size={12} />}>
          Add
        </Button>
      </div>
      {changes.map((change, idx) => (
        <Card
          key={idx}
          variant="sunken"
          className="relative flex flex-col gap-[var(--space-3)] p-[var(--space-4)]"
        >
          <Button
            variant="icon-only"
            size="sm"
            onClick={() => removeChange(idx)}
            className="absolute right-[var(--space-3)] top-[var(--space-3)]"
            aria-label="Remove expense change"
            icon={<X size={14} />}
          />
          <div className="grid grid-cols-2 gap-[var(--space-3)] pr-[var(--space-7)]">
            <FieldShell label="Annual expense">
              <TextInput
                inputType="currency"
                value={change.newExpense.annualAmount ?? ""}
                onChange={(e) => {
                  const val = parseFloat(e.target.value.replace(/[^0-9.-]/g, ""));
                  updateChange(idx, { annualAmount: isNaN(val) ? 0 : val });
                }}
                placeholder="0"
              />
            </FieldShell>
            <FieldShell label="Inflation override (optional)">
              <TextInput
                inputType="percent"
                value={
                  change.newExpense.inflationRate != null
                    ? String(Math.round(change.newExpense.inflationRate * 100 * 10) / 10)
                    : ""
                }
                onChange={(e) => {
                  const v = e.target.value.trim();
                  if (v === "") {
                    updateChange(idx, { inflationRate: null });
                  } else {
                    const num = parseFloat(v);
                    if (!isNaN(num)) updateChange(idx, { inflationRate: num / 100 });
                  }
                }}
                placeholder="CPI"
              />
            </FieldShell>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ContributionChangesSection({
  event,
  accounts,
  onUpdateImpact,
}: {
  event: LifeEvent;
  accounts: EditorProps["scenario"]["accounts"];
  onUpdateImpact: (id: string, patch: Partial<FinancialImpact>) => void;
}) {
  const changes = event.financialImpact.contributionChanges;

  if (accounts.length === 0) return null;

  const addChange = () => {
    const newChange: ContributionChange = {
      accountId: accounts[0].id,
      newAnnualContribution: 0,
    };
    onUpdateImpact(event.id, { contributionChanges: [...changes, newChange] });
  };

  const updateChange = (idx: number, patch: Partial<ContributionChange>) => {
    const updated = changes.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onUpdateImpact(event.id, { contributionChanges: updated });
  };

  const removeChange = (idx: number) => {
    onUpdateImpact(event.id, {
      contributionChanges: changes.filter((_, i) => i !== idx),
    });
  };

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: `${a.label} (${a.type.replace(/_/g, " ")})`,
  }));

  return (
    <div className="flex flex-col gap-[var(--space-3)]">
      <div className="flex items-center justify-between">
        <span className="text-overline text-text-tertiary">Contribution Changes</span>
        <Button variant="ghost" size="sm" onClick={addChange} icon={<Plus size={12} />}>
          Add
        </Button>
      </div>
      {changes.map((change, idx) => (
        <Card key={idx} variant="sunken" className="flex flex-col gap-[var(--space-3)] p-[var(--space-4)]">
          <div className="flex items-center justify-between gap-[var(--space-2)]">
            <Select
              value={change.accountId}
              onValueChange={(v) => updateChange(idx, { accountId: v })}
              options={accountOptions}
            />
            <Button
              variant="icon-only"
              size="sm"
              onClick={() => removeChange(idx)}
              aria-label="Remove contribution change"
              icon={<X size={14} />}
            />
          </div>
          <FieldShell label="New annual contribution">
            <TextInput
              inputType="currency"
              value={change.newAnnualContribution || ""}
              onChange={(e) => {
                const val = parseFloat(e.target.value.replace(/[^0-9.-]/g, ""));
                updateChange(idx, {
                  newAnnualContribution: isNaN(val) ? 0 : val,
                });
              }}
              placeholder="0"
            />
          </FieldShell>
        </Card>
      ))}
    </div>
  );
}
