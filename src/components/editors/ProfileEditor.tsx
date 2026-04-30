import { useCallback, useMemo } from "react";
import type { EditorProps } from "./types";
import type { UserProfile, SpouseProfile, FilingStatus, Sex, Month, Scenario } from "@/models";
import { FieldShell } from "@/components/primitives/Input/FieldShell";
import { TextInput } from "@/components/primitives/Input/TextInput";
import { Select } from "@/components/primitives/Input/Select";
import { RadioGroup } from "@/components/primitives/Input/RadioGroup";
import { Slider } from "@/components/primitives/Input/Slider";
import { US_STATES } from "@/lib/us-states";
import { STATE_OF_RESIDENCE_HELPER } from "@/lib/disclaimers";
import { fraForBirthYear, makeSsPersonForBirthYear } from "@/models/defaults";
import { useOptionalToast } from "@/components/primitives/Toast";
import { Card } from "@/components/primitives/Card";

// Birth year range: from 1925 (already-retired centenarians stress-testing
// their plan) up to "16 years ago" (youngest user who could plausibly have
// financial accounts). Computed at module load so the upper bound shifts
// forward each calendar year.
const BIRTH_YEAR_OLDEST = 1925;
const BIRTH_YEAR_YOUNGEST = new Date().getFullYear() - 16;
const BIRTH_YEAR_OPTIONS = Array.from({ length: BIRTH_YEAR_YOUNGEST - BIRTH_YEAR_OLDEST + 1 }, (_, i) => {
  const y = String(BIRTH_YEAR_YOUNGEST - i);
  return { value: y, label: y };
});

const MONTH_OPTIONS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const FILING_STATUS_OPTIONS = [
  { value: "single", label: "Single" },
  { value: "married_filing_jointly", label: "Married Filing Jointly" },
  { value: "married_filing_separately", label: "Married Filing Separately" },
  { value: "head_of_household", label: "Head of Household" },
];

const SEX_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

export function ProfileEditor({ scenario, onUpdate }: EditorProps) {
  const profile = scenario.profile;
  const isMarried = profile.filingStatus === "married_filing_jointly";
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  // Strict month comparison: we only store birth month (no day), so err on
  // the lower side and don't bump age until the month *after* the birth month.
  const ageOf = (birthYear: number, birthMonth: number) =>
    currentYear - birthYear - (currentMonth > birthMonth ? 0 : 1);
  const selfCurrentAge = ageOf(profile.birthYear, profile.birthMonth);
  const spouseCurrentAge = profile.spouse ? ageOf(profile.spouse.birthYear, profile.spouse.birthMonth) : 0;
  // Toast surface is optional in tests / standalone editor renders; fall back
  // to a no-op so the editor stays usable outside the AppShell context.
  const toastCtx = useOptionalToast();
  const toast = useMemo(() => toastCtx ?? (() => {}), [toastCtx]);

  const updateProfile = useCallback(
    (patch: Partial<UserProfile>) => {
      const update: Partial<Scenario> = { profile: { ...profile, ...patch } };
      // Recompute SSA Full Retirement Age when birth year changes
      if (patch.birthYear != null && patch.birthYear !== profile.birthYear) {
        const fra = fraForBirthYear(patch.birthYear);
        update.socialSecurity = {
          ...scenario.socialSecurity,
          self: { ...scenario.socialSecurity.self, fra },
        };
      }
      onUpdate(update);
    },
    [profile, scenario.socialSecurity, onUpdate],
  );

  const updateSpouse = useCallback(
    (patch: Partial<SpouseProfile>) => {
      const current = profile.spouse ?? {
        name: "",
        birthYear: 1990,
        birthMonth: 1 as Month,
        sex: "female" as Sex,
        retirementAge: 65,
      };
      const newSpouse = { ...current, ...patch };
      const update: Partial<Scenario> = { profile: { ...profile, spouse: newSpouse } };
      if (patch.birthYear != null && patch.birthYear !== current.birthYear) {
        const ss = scenario.socialSecurity;
        // Initialize spouse SS from a clean default keyed to their birth year,
        // not by cloning self's settings. Cloning would inherit the user's own
        // fraMonthlyBenefit, a confusing footgun for non-working spouses.
        update.socialSecurity = {
          ...ss,
          spouse: ss.spouse
            ? { ...ss.spouse, fra: fraForBirthYear(patch.birthYear) }
            : makeSsPersonForBirthYear(patch.birthYear),
        };
      }
      onUpdate(update);
    },
    [profile, scenario.socialSecurity, onUpdate],
  );

  const handleFilingStatusChange = useCallback(
    (value: string) => {
      const fs = value as FilingStatus;
      const patch: Partial<UserProfile> = { filingStatus: fs };
      if (fs === "married_filing_jointly" && !profile.spouse) {
        patch.spouse = {
          name: "",
          birthYear: 1990,
          birthMonth: 1,
          sex: "female",
          retirementAge: 65,
        };
      }
      if (fs !== "married_filing_jointly") {
        patch.spouse = null;
      }

      // Reassign any spouse-owned accounts/income to self when leaving MFJ.
      // Otherwise they become orphaned data the engine still touches.
      if (fs !== "married_filing_jointly") {
        const spouseAccountCount = scenario.accounts.filter((a) => a.owner === "spouse").length;
        const spouseIncomeCount = scenario.incomeSources.filter((i) => i.owner === "spouse").length;
        const reassignedAccounts = scenario.accounts.map((a) =>
          a.owner === "spouse" ? { ...a, owner: "self" as const } : a,
        );
        const reassignedIncome = scenario.incomeSources.map((i) =>
          i.owner === "spouse" ? { ...i, owner: "self" as const } : i,
        );
        const update: Partial<typeof scenario> = {
          profile: { ...profile, ...patch },
          accounts: reassignedAccounts,
          incomeSources: reassignedIncome,
          socialSecurity: { ...scenario.socialSecurity, spouse: null },
        };
        onUpdate(update);
        if (spouseAccountCount > 0 || spouseIncomeCount > 0) {
          const parts: string[] = [];
          if (spouseAccountCount > 0)
            parts.push(`${spouseAccountCount} account${spouseAccountCount > 1 ? "s" : ""}`);
          if (spouseIncomeCount > 0)
            parts.push(`${spouseIncomeCount} income source${spouseIncomeCount > 1 ? "s" : ""}`);
          toast({
            variant: "info",
            title: "Reassigned spouse-owned items to self",
            description: `${parts.join(" and ")} were owned by your spouse. They're now owned by you.`,
          });
        }
        return;
      }

      // Switching INTO MFJ: seed a default spouse SS person rather than letting
      // the simulation read a null / inherited entry.
      if (fs === "married_filing_jointly" && !scenario.socialSecurity.spouse && patch.spouse) {
        const update: Partial<typeof scenario> = {
          profile: { ...profile, ...patch },
          socialSecurity: {
            ...scenario.socialSecurity,
            spouse: makeSsPersonForBirthYear(patch.spouse.birthYear),
          },
        };
        onUpdate(update);
        return;
      }

      updateProfile(patch);
    },
    [profile, scenario, onUpdate, updateProfile, toast],
  );

  return (
    <div className="flex flex-col gap-[var(--space-5)]">
      <Card variant="surface" className="flex flex-col gap-[var(--space-5)] p-[var(--space-5)]">
        <h2 className="text-heading-sm font-semibold text-text-primary">Your Information</h2>

        <FieldShell label="Your name">
          <TextInput
            value={profile.name}
            onChange={(e) => updateProfile({ name: e.target.value })}
            placeholder="Enter your name"
          />
        </FieldShell>

        <div className="grid grid-cols-2 gap-[var(--space-4)]">
          <FieldShell label="Birth year">
            <Select
              value={String(profile.birthYear)}
              onValueChange={(v) => updateProfile({ birthYear: Number(v) })}
              options={BIRTH_YEAR_OPTIONS}
              placeholder="Year"
            />
          </FieldShell>
          <FieldShell label="Birth month">
            <Select
              value={String(profile.birthMonth)}
              onValueChange={(v) => updateProfile({ birthMonth: Number(v) as Month })}
              options={MONTH_OPTIONS}
              placeholder="Month"
            />
          </FieldShell>
        </div>

        <FieldShell label="Sex">
          <RadioGroup
            value={profile.sex}
            onValueChange={(v) => updateProfile({ sex: v as Sex })}
            options={SEX_OPTIONS}
            orientation="horizontal"
          />
        </FieldShell>

        <FieldShell label="Filing status">
          <Select
            value={profile.filingStatus}
            onValueChange={handleFilingStatusChange}
            options={FILING_STATUS_OPTIONS}
          />
        </FieldShell>

        <FieldShell label="State of residence" helper={STATE_OF_RESIDENCE_HELPER}>
          <Select
            value={profile.stateOfResidence}
            onValueChange={(v) => updateProfile({ stateOfResidence: v })}
            options={[...US_STATES]}
            placeholder="Select state"
          />
        </FieldShell>

        <FieldShell label="Target retirement age">
          <Slider
            value={[Math.max(profile.retirementAge, selfCurrentAge)]}
            onValueChange={([v]) => updateProfile({ retirementAge: v })}
            min={selfCurrentAge}
            max={Math.max(90, selfCurrentAge)}
            step={1}
            formatValue={(v) => `Age ${v}`}
          />
        </FieldShell>

        <FieldShell label="Plan to age" helper="How long should your plan cover?">
          <Slider
            value={[profile.planningHorizonAge]}
            onValueChange={([v]) => updateProfile({ planningHorizonAge: v })}
            min={80}
            max={110}
            step={1}
            formatValue={(v) => `Age ${v}`}
          />
        </FieldShell>
      </Card>

      {isMarried && profile.spouse && (
        <Card variant="surface" className="flex flex-col gap-[var(--space-5)] p-[var(--space-5)]">
          <h2 className="text-heading-sm font-semibold text-text-primary">Spouse Information</h2>

          <FieldShell label="Spouse's name">
            <TextInput
              value={profile.spouse.name}
              onChange={(e) => updateSpouse({ name: e.target.value })}
              placeholder="Enter spouse's name"
            />
          </FieldShell>

          <div className="grid grid-cols-2 gap-[var(--space-4)]">
            <FieldShell label="Birth year">
              <Select
                value={String(profile.spouse.birthYear)}
                onValueChange={(v) => updateSpouse({ birthYear: Number(v) })}
                options={BIRTH_YEAR_OPTIONS}
                placeholder="Year"
              />
            </FieldShell>
            <FieldShell label="Birth month">
              <Select
                value={String(profile.spouse.birthMonth)}
                onValueChange={(v) => updateSpouse({ birthMonth: Number(v) as Month })}
                options={MONTH_OPTIONS}
                placeholder="Month"
              />
            </FieldShell>
          </div>

          <FieldShell label="Sex">
            <RadioGroup
              value={profile.spouse.sex}
              onValueChange={(v) => updateSpouse({ sex: v as Sex })}
              options={SEX_OPTIONS}
              orientation="horizontal"
            />
          </FieldShell>

          <FieldShell label="Spouse's target retirement age">
            <Slider
              value={[Math.max(profile.spouse.retirementAge, spouseCurrentAge)]}
              onValueChange={([v]) => updateSpouse({ retirementAge: v })}
              min={spouseCurrentAge}
              max={Math.max(90, spouseCurrentAge)}
              step={1}
              formatValue={(v) => `Age ${v}`}
            />
          </FieldShell>
        </Card>
      )}
    </div>
  );
}
