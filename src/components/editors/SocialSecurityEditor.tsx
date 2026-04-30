import { useCallback } from "react";
import type { EditorProps } from "./types";
import type { SocialSecurityConfig, SocialSecurityPerson } from "@/models";
import { FieldShell } from "@/components/primitives/Input/FieldShell";
import { TextInput } from "@/components/primitives/Input/TextInput";
import { Slider } from "@/components/primitives/Input/Slider";
import { LabeledSwitch } from "@/components/primitives/Input/Switch";
import { Card } from "@/components/primitives/Card";
import { claimingAdjustment } from "@/engine/social-security";
import { fraForBirthYear } from "@/models/defaults";
import { SOCIAL_SECURITY_SCOPE_NOTE } from "@/lib/disclaimers";

export function SocialSecurityEditor({ scenario, onUpdate }: EditorProps) {
  const ss = scenario.socialSecurity;
  const isMarried = scenario.profile.filingStatus === "married_filing_jointly";

  const updateSS = useCallback(
    (patch: Partial<SocialSecurityConfig>) => {
      onUpdate({ socialSecurity: { ...ss, ...patch } });
    },
    [ss, onUpdate],
  );

  const updateSSPerson = useCallback(
    (who: "self" | "spouse", patch: Partial<SocialSecurityPerson>) => {
      if (who === "self") {
        updateSS({ self: { ...ss.self, ...patch } });
      } else if (ss.spouse) {
        updateSS({ spouse: { ...ss.spouse, ...patch } });
      }
    },
    [ss, updateSS],
  );

  return (
    <div className="flex flex-col gap-[var(--space-5)]">
      <p className="text-caption leading-relaxed text-text-tertiary">{SOCIAL_SECURITY_SCOPE_NOTE}</p>

      <SSPersonCard
        label="Your"
        person={ss.self}
        derivedFra={fraForBirthYear(scenario.profile.birthYear)}
        onChange={(patch) => updateSSPerson("self", patch)}
      />

      {isMarried && ss.spouse && scenario.profile.spouse && (
        <SSPersonCard
          label="Spouse's"
          person={ss.spouse}
          derivedFra={fraForBirthYear(scenario.profile.spouse.birthYear)}
          onChange={(patch) => updateSSPerson("spouse", patch)}
        />
      )}

      <Card variant="surface" className="flex flex-col gap-[var(--space-4)] p-[var(--space-5)]">
        <h2 className="text-heading-sm font-semibold text-text-primary">Cost-of-Living</h2>
        <FieldShell label="Annual COLA assumption" helper="Used when inflation mode is fixed">
          <Slider
            value={[Math.round(ss.colaRate * 1000) / 10]}
            onValueChange={([v]) => updateSS({ colaRate: v / 100 })}
            min={0}
            max={5}
            step={0.1}
            formatValue={(v) => `${v}%`}
          />
        </FieldShell>

        <LabeledSwitch
          checked={ss.useSolvencyHaircut}
          onCheckedChange={(v) => updateSS({ useSolvencyHaircut: v })}
          label={`Apply trust-fund solvency haircut after ${ss.solvencyHaircutYear}`}
        />

        {ss.useSolvencyHaircut && (
          <div className="grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-2">
            <FieldShell label="Haircut year">
              <TextInput
                inputType="number"
                value={String(ss.solvencyHaircutYear)}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v)) updateSS({ solvencyHaircutYear: v });
                }}
              />
            </FieldShell>
            <FieldShell label="Benefit factor">
              <Slider
                value={[Math.round(ss.solvencyHaircutFactor * 100)]}
                onValueChange={([v]) => updateSS({ solvencyHaircutFactor: v / 100 })}
                min={50}
                max={100}
                step={1}
                formatValue={(v) => `${v}%`}
              />
            </FieldShell>
          </div>
        )}
      </Card>
    </div>
  );
}

// Render a fractional FRA like 66.83 as "66 years 10 months" for readability.
function formatFra(fra: number): string {
  const years = Math.floor(fra);
  const months = Math.round((fra - years) * 12);
  if (months === 0) return `${years}`;
  return `${years} years ${months} ${months === 1 ? "month" : "months"}`;
}

function SSPersonCard({
  label,
  person,
  derivedFra,
  onChange,
}: {
  label: string;
  person: SocialSecurityPerson;
  derivedFra: number;
  onChange: (patch: Partial<SocialSecurityPerson>) => void;
}) {
  const fraMismatch = Math.abs(person.fra - derivedFra) > 0.01;

  return (
    <Card variant="surface" className="flex flex-col gap-[var(--space-4)] p-[var(--space-5)]">
      <h2 className="text-heading-sm font-semibold text-text-primary">{label} Social Security</h2>

      <LabeledSwitch
        checked={person.enabled}
        onCheckedChange={(v) => onChange({ enabled: v })}
        label={`Include ${label.toLowerCase()} benefit`}
      />

      {person.enabled && (
        <>
          <FieldShell label="Monthly benefit at FRA" helper="Find this on your SSA statement">
            <TextInput
              inputType="currency"
              value={person.fraMonthlyBenefit || ""}
              onChange={(e) => {
                const v = parseFloat(e.target.value.replace(/[^0-9.-]/g, ""));
                onChange({ fraMonthlyBenefit: isNaN(v) ? 0 : v });
              }}
              placeholder="0"
            />
          </FieldShell>

          <FieldShell
            label="Full Retirement Age"
            helper={
              fraMismatch ? `SSA schedule says ${formatFra(derivedFra)} for this birth year.` : undefined
            }
          >
            <TextInput
              inputType="number"
              value={String(person.fra)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) onChange({ fra: v });
              }}
            />
          </FieldShell>

          <FieldShell
            label="Planned claiming age"
            helper={`${(claimingAdjustment(person.claimingAge, person.fra) * 100).toFixed(1)}% of FRA benefit`}
          >
            <Slider
              value={[person.claimingAge]}
              onValueChange={([v]) => onChange({ claimingAge: v })}
              min={62}
              max={70}
              step={1}
              formatValue={(v) => `Age ${v}`}
            />
          </FieldShell>
        </>
      )}
    </Card>
  );
}
