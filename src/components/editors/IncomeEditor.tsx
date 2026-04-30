import { useCallback } from "react";
import { Plus, X } from "lucide-react";
import type { EditorProps } from "./types";
import type { IncomeSource, IncomeType, Owner, SocialSecurityConfig, SocialSecurityPerson } from "@/models";
import { FieldShell } from "@/components/primitives/Input/FieldShell";
import { TextInput } from "@/components/primitives/Input/TextInput";
import { Select } from "@/components/primitives/Input/Select";
import { Slider } from "@/components/primitives/Input/Slider";
import { LabeledSwitch } from "@/components/primitives/Input/Switch";
import { Button } from "@/components/primitives/Button";
import { Card } from "@/components/primitives/Card";
import { formatCurrency } from "@/lib/format";
import { claimingAdjustment } from "@/engine/social-security";

const INCOME_TYPE_OPTIONS = [
  { value: "salary", label: "Salary" },
  { value: "self_employment", label: "Self-Employment" },
  { value: "bonus", label: "Bonus" },
  { value: "pension", label: "Pension" },
  { value: "annuity", label: "Annuity" },
  { value: "rental", label: "Rental Income" },
  { value: "part_time", label: "Part-Time Work" },
  { value: "royalty", label: "Royalty" },
  { value: "other", label: "Other" },
];

const OWNER_OPTIONS = [
  { value: "self", label: "Self" },
  { value: "spouse", label: "Spouse" },
];

function formatBenefitPreview(monthlyFRA: number, age: number, fra: number): string {
  const factor = claimingAdjustment(age, fra);
  const monthly = Math.round(monthlyFRA * factor);
  const pct = Math.round(factor * 100);
  return `${formatCurrency(monthly)}/mo (${pct}% of FRA)`;
}

// New incomes default to the salary archetype: wage-like, ends at retirement,
// taxable, inflation-adjusted, modest growth. Users can toggle "Ends at
// retirement" off for non-wage sources (pensions, annuities, rental) when
// they pick a different type.
function createIncomeSource(owner: Owner, _retirementAge: number, currentAge: number): IncomeSource {
  return {
    id: crypto.randomUUID(),
    owner,
    label: "",
    type: "salary",
    annualAmount: 0,
    startAge: Math.max(18, currentAge),
    endAge: null,
    inflationAdjusted: true,
    growthRate: 0.02,
    taxable: true,
    endsAtRetirement: true,
  };
}

export function IncomeEditor({ scenario, onUpdate }: EditorProps) {
  const isMarried = scenario.profile.filingStatus === "married_filing_jointly";
  const currentAge = new Date().getFullYear() - scenario.profile.birthYear;

  const updateIncomeSources = useCallback(
    (sources: IncomeSource[]) => {
      onUpdate({ incomeSources: sources });
    },
    [onUpdate],
  );

  const addSource = useCallback(() => {
    const source = createIncomeSource("self", scenario.profile.retirementAge, currentAge);
    updateIncomeSources([...scenario.incomeSources, source]);
  }, [scenario.incomeSources, scenario.profile.retirementAge, currentAge, updateIncomeSources]);

  const updateSource = useCallback(
    (id: string, patch: Partial<IncomeSource>) => {
      updateIncomeSources(scenario.incomeSources.map((src) => (src.id === id ? { ...src, ...patch } : src)));
    },
    [scenario.incomeSources, updateIncomeSources],
  );

  const removeSource = useCallback(
    (id: string) => {
      updateIncomeSources(scenario.incomeSources.filter((src) => src.id !== id));
    },
    [scenario.incomeSources, updateIncomeSources],
  );

  const updateSS = useCallback(
    (patch: Partial<SocialSecurityConfig>) => {
      onUpdate({ socialSecurity: { ...scenario.socialSecurity, ...patch } });
    },
    [scenario.socialSecurity, onUpdate],
  );

  const updateSSPerson = useCallback(
    (who: "self" | "spouse", patch: Partial<SocialSecurityPerson>) => {
      if (who === "self") {
        updateSS({ self: { ...scenario.socialSecurity.self, ...patch } });
      } else if (scenario.socialSecurity.spouse) {
        updateSS({ spouse: { ...scenario.socialSecurity.spouse, ...patch } });
      }
    },
    [scenario.socialSecurity, updateSS],
  );

  return (
    <div className="flex flex-col gap-[var(--space-5)]">
      <div className="flex flex-col gap-[var(--space-5)]">
        {scenario.incomeSources.map((src) => (
          <Card
            key={src.id}
            variant="surface"
            className="relative flex flex-col gap-[var(--space-4)] p-[var(--space-5)]"
          >
            <Button
              variant="icon-only"
              size="md"
              onClick={() => removeSource(src.id)}
              className="absolute right-[var(--space-2)] top-[var(--space-2)]"
              aria-label="Remove income source"
              icon={<X size={16} />}
            />

            <div className="grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-2">
              <FieldShell label="Label">
                <TextInput
                  value={src.label}
                  onChange={(e) => updateSource(src.id, { label: e.target.value })}
                  placeholder="e.g., Primary Salary"
                />
              </FieldShell>
              <FieldShell label="Type">
                <Select
                  value={src.type}
                  onValueChange={(v) => updateSource(src.id, { type: v as IncomeType })}
                  options={INCOME_TYPE_OPTIONS}
                />
              </FieldShell>
            </div>

            {isMarried && (
              <FieldShell label="Owner">
                <Select
                  value={src.owner}
                  onValueChange={(v) => updateSource(src.id, { owner: v as Owner })}
                  options={OWNER_OPTIONS}
                />
              </FieldShell>
            )}

            <div className="grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-2">
              <FieldShell label="Annual amount">
                <TextInput
                  inputType="currency"
                  value={src.annualAmount || ""}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value.replace(/[^0-9.-]/g, ""));
                    updateSource(src.id, {
                      annualAmount: isNaN(val) ? 0 : val,
                    });
                  }}
                  placeholder="0"
                />
              </FieldShell>
              <FieldShell label="Annual raise rate">
                <TextInput
                  inputType="percent"
                  value={String(Math.round(src.growthRate * 100 * 10) / 10)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    updateSource(src.id, {
                      growthRate: isNaN(val) ? 0 : val / 100,
                    });
                  }}
                  placeholder="2"
                />
              </FieldShell>
            </div>

            <div className="grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-2">
              <FieldShell label="Start age">
                <TextInput
                  inputType="number"
                  value={String(src.startAge)}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) updateSource(src.id, { startAge: val });
                  }}
                />
              </FieldShell>
              <FieldShell
                label="End age"
                helper={src.endsAtRetirement ? "Tied to retirement age" : "Leave blank for lifetime"}
              >
                <TextInput
                  inputType="number"
                  value={
                    src.endsAtRetirement
                      ? String(
                          (src.owner === "spouse"
                            ? scenario.profile.spouse?.retirementAge
                            : scenario.profile.retirementAge) ?? scenario.profile.retirementAge,
                        )
                      : src.endAge != null
                        ? String(src.endAge)
                        : ""
                  }
                  disabled={src.endsAtRetirement}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value) : null;
                    updateSource(src.id, {
                      endAge: val !== null && !isNaN(val) ? val : null,
                    });
                  }}
                  placeholder="Lifetime"
                />
              </FieldShell>
            </div>

            <LabeledSwitch
              checked={src.endsAtRetirement}
              onCheckedChange={(v) => updateSource(src.id, { endsAtRetirement: v })}
              label={
                <>
                  Ends at retirement (income stops when {src.owner === "spouse" ? "spouse" : "you"} retire
                  {src.owner === "spouse" ? "s" : ""})
                </>
              }
            />

            <LabeledSwitch
              checked={src.taxable}
              onCheckedChange={(v) => updateSource(src.id, { taxable: v })}
              label="Taxable income"
            />

            <LabeledSwitch
              checked={src.inflationAdjusted}
              onCheckedChange={(v) => updateSource(src.id, { inflationAdjusted: v })}
              label="Inflation-adjusted (turn off for fixed pensions / annuities)"
            />
          </Card>
        ))}

        <Button variant="secondary" onClick={addSource} icon={<Plus size={16} />}>
          Add Income Source
        </Button>
      </div>

      <Card variant="surface" className="flex flex-col gap-[var(--space-5)] p-[var(--space-5)]">
        <h2 className="text-heading-sm font-semibold text-text-primary">Social Security</h2>

        <SSPersonFields
          label="Your"
          person={scenario.socialSecurity.self}
          onChange={(patch) => updateSSPerson("self", patch)}
        />

        {isMarried && scenario.socialSecurity.spouse && (
          <SSPersonFields
            label="Spouse's"
            person={scenario.socialSecurity.spouse}
            onChange={(patch) => updateSSPerson("spouse", patch)}
          />
        )}

        <LabeledSwitch
          checked={scenario.socialSecurity.useSolvencyHaircut}
          onCheckedChange={(v) => updateSS({ useSolvencyHaircut: v })}
          label="Reduce benefits by ~21% after 2034?"
        />
      </Card>
    </div>
  );
}

function SSPersonFields({
  label,
  person,
  onChange,
}: {
  label: string;
  person: SocialSecurityPerson;
  onChange: (patch: Partial<SocialSecurityPerson>) => void;
}) {
  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      <LabeledSwitch
        checked={person.enabled}
        onCheckedChange={(v) => onChange({ enabled: v })}
        label={
          <span className="text-body-sm font-medium text-text-primary">Include {label} Social Security</span>
        }
      />

      {person.enabled && (
        <>
          <FieldShell label={`${label} monthly benefit at FRA`} helper="Find this at ssa.gov/myaccount">
            <TextInput
              inputType="currency"
              value={person.fraMonthlyBenefit || ""}
              onChange={(e) => {
                const val = parseFloat(e.target.value.replace(/[^0-9.-]/g, ""));
                onChange({ fraMonthlyBenefit: isNaN(val) ? 0 : val });
              }}
              placeholder="0"
            />
          </FieldShell>

          <FieldShell label={`${label} planned claiming age`}>
            <Slider
              value={[person.claimingAge]}
              onValueChange={([v]) => onChange({ claimingAge: v })}
              min={62}
              max={70}
              step={1}
              formatValue={(v) => `Age ${v}`}
            />
          </FieldShell>

          {person.fraMonthlyBenefit > 0 && (
            <p className="text-body-sm text-text-secondary">
              At age {person.claimingAge}:{" "}
              <span className="font-medium text-text-primary">
                {formatBenefitPreview(person.fraMonthlyBenefit, person.claimingAge, person.fra)}
              </span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
