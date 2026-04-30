import { useCallback, useState } from "react";
import { Plus, X } from "lucide-react";
import type { EditorProps } from "./types";
import type { Account, AccountType, Owner } from "@/models";
import { FIXED_INTEREST_TYPES, DEFAULT_FIXED_RATES } from "@/models/account";
import { DEFAULT_ALLOCATION, CASH_ALLOCATION } from "@/models/defaults";
import { FieldShell } from "@/components/primitives/Input/FieldShell";
import { TextInput } from "@/components/primitives/Input/TextInput";
import { Select } from "@/components/primitives/Input/Select";
import { Slider } from "@/components/primitives/Input/Slider";
import { LabeledSwitch } from "@/components/primitives/Input/Switch";
import { Button } from "@/components/primitives/Button";
import { Card } from "@/components/primitives/Card";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/cn";

// IRS 2026 employee contribution limits, used only as soft warnings in the
// editor. Updates yearly per Rev. Proc. announcements; refresh when stale.
// Source: IRS Notice 2025-87 (2026 retirement plan limits).
const IRS_CONTRIBUTION_LIMIT_2026: Partial<Record<AccountType, number>> = {
  traditional_ira: 7_500,
  roth_ira: 7_500,
  traditional_401k: 24_500,
  roth_401k: 24_500,
  hsa: 4_400,
  "529": 19_000, // gift-tax annual exclusion (no statutory cap, but practical guideline)
};

// Age-based catch-up contributions for 2026. SECURE 2.0 super catch-up
// (60–63) replaces the regular 50+ catch-up for those years.
function catchupForAge(type: AccountType, age: number): number {
  if (type === "traditional_401k" || type === "roth_401k") {
    if (age >= 60 && age <= 63) return 11_250;
    if (age >= 50) return 8_000;
    return 0;
  }
  if (type === "traditional_ira" || type === "roth_ira") {
    return age >= 50 ? 1_100 : 0;
  }
  if (type === "hsa") {
    return age >= 55 ? 1_000 : 0;
  }
  return 0;
}

function getMaxContribution(type: AccountType, age: number): number | null {
  const base = IRS_CONTRIBUTION_LIMIT_2026[type];
  if (base == null) return null;
  return base + catchupForAge(type, age);
}

const ACCOUNT_TYPE_OPTIONS = [
  { value: "taxable", label: "Taxable Brokerage" },
  { value: "traditional_ira", label: "Traditional IRA" },
  { value: "traditional_401k", label: "Traditional 401(k)" },
  { value: "roth_ira", label: "Roth IRA" },
  { value: "roth_401k", label: "Roth 401(k)" },
  { value: "hsa", label: "HSA" },
  { value: "hysa", label: "High-Yield Savings" },
  { value: "cd", label: "Certificate of Deposit (CD)" },
  { value: "money_market", label: "Money Market" },
  { value: "i_bonds", label: "I Bonds" },
  { value: "529", label: "529 Plan" },
];

const ACCOUNT_TYPE_DESCRIPTIONS: Record<AccountType, string> = {
  taxable: "No special tax treatment. You pay taxes on dividends, interest, and capital gains each year.",
  traditional_ira:
    "Contributions may be tax-deductible. Growth is tax-deferred. Withdrawals taxed as ordinary income.",
  traditional_401k:
    "Contributions reduce your taxable income. Growth is tax-deferred. Withdrawals taxed as ordinary income.",
  roth_ira: "Contributions are after-tax. Growth and qualified withdrawals are tax-free.",
  roth_401k: "Contributions are after-tax. Growth and qualified withdrawals are tax-free.",
  hsa: "Triple tax advantage: tax-deductible contributions, tax-free growth, tax-free withdrawals for medical expenses.",
  hysa: "FDIC-insured savings account earning a competitive interest rate. Fully taxable but highly liquid with no risk.",
  cd: "Fixed interest rate for a set term. FDIC-insured. Interest taxed as ordinary income.",
  money_market:
    "Low-risk fund earning interest similar to a savings account. Highly liquid, interest taxed as ordinary income.",
  i_bonds: "Treasury bonds with inflation-indexed returns. Tax-deferred, state/local tax exempt.",
  "529": "After-tax contributions. Tax-free growth and withdrawals for qualified education expenses.",
};

const OWNER_OPTIONS = [
  { value: "self", label: "Self" },
  { value: "spouse", label: "Spouse" },
];

function allocationFromEquityPct(equity: number) {
  const bond = 1 - equity;
  return {
    usLargeCap: equity * 0.7,
    usSmallCap: equity * 0.15,
    intlDeveloped: equity * 0.15,
    intlEmerging: 0,
    usBonds: bond * 0.85,
    tips: bond * 0.15,
    cash: 0,
  };
}

function equityPctFromAllocation(alloc: typeof DEFAULT_ALLOCATION): number {
  return alloc.usLargeCap + alloc.usSmallCap + alloc.intlDeveloped + alloc.intlEmerging;
}

function createAccount(retirementAge: number): Account {
  return {
    id: crypto.randomUUID(),
    owner: "self",
    label: "",
    type: "traditional_401k",
    balance: 0,
    costBasis: 0,
    annualContribution: 0,
    employerMatch: 0,
    contributionEndAge: retirementAge,
    allocation: { ...DEFAULT_ALLOCATION },
    useGlidePath: false,
    glidePath: [],
    fixedAnnualReturn: null,
  };
}

const isFixedInterest = (t: AccountType) => FIXED_INTEREST_TYPES.has(t);

const is401k = (t: AccountType) => t === "traditional_401k" || t === "roth_401k";

export function AccountsEditor({ scenario, onUpdate }: EditorProps) {
  const isMarried = scenario.profile.filingStatus === "married_filing_jointly";
  const totalBalance = scenario.accounts.reduce((sum, a) => sum + a.balance, 0);
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  // Strict month comparison: we only store birth month (no day), so err on
  // the lower side and don't bump age until the month *after* the birth month.
  const ageOf = (birthYear: number, birthMonth: number) =>
    currentYear - birthYear - (currentMonth > birthMonth ? 0 : 1);
  const selfCurrentAge = ageOf(scenario.profile.birthYear, scenario.profile.birthMonth);
  const spouseCurrentAge = scenario.profile.spouse
    ? ageOf(scenario.profile.spouse.birthYear, scenario.profile.spouse.birthMonth)
    : selfCurrentAge;

  const updateAccounts = useCallback(
    (accounts: Account[]) => {
      onUpdate({ accounts });
    },
    [onUpdate],
  );

  const addAccount = useCallback(() => {
    updateAccounts([...scenario.accounts, createAccount(scenario.profile.retirementAge)]);
  }, [scenario.accounts, scenario.profile.retirementAge, updateAccounts]);

  const updateAccount = useCallback(
    (id: string, patch: Partial<Account>) => {
      updateAccounts(scenario.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    },
    [scenario.accounts, updateAccounts],
  );

  const removeAccount = useCallback(
    (id: string) => {
      updateAccounts(scenario.accounts.filter((a) => a.id !== id));
    },
    [scenario.accounts, updateAccounts],
  );

  return (
    <div className="flex flex-col gap-[var(--space-5)]">
      {scenario.accounts.length > 0 && (
        <p className="text-body-sm text-text-secondary">
          Total balance: <span className="font-medium text-text-primary">{formatCurrency(totalBalance)}</span>
        </p>
      )}

      {scenario.accounts.map((acct) => {
        const equityPct = equityPctFromAllocation(acct.allocation);
        const ownerRetirementAge =
          acct.owner === "spouse" && scenario.profile.spouse
            ? scenario.profile.spouse.retirementAge
            : scenario.profile.retirementAge;
        const ownerCurrentAge = acct.owner === "spouse" ? spouseCurrentAge : selfCurrentAge;
        const stopsAtRetirement = acct.contributionEndAge >= ownerRetirementAge;
        const maxContribution = getMaxContribution(acct.type, ownerCurrentAge);
        return (
          <Card
            key={acct.id}
            variant="surface"
            className="relative flex flex-col gap-[var(--space-4)] p-[var(--space-5)]"
          >
            <Button
              variant="icon-only"
              size="md"
              onClick={() => removeAccount(acct.id)}
              className="absolute right-[var(--space-2)] top-[var(--space-2)]"
              aria-label="Remove account"
              icon={<X size={16} />}
            />

            <div className="grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-2">
              <FieldShell label="Label">
                <TextInput
                  value={acct.label}
                  onChange={(e) => updateAccount(acct.id, { label: e.target.value })}
                  placeholder="e.g., Vanguard 401k"
                />
              </FieldShell>
              <FieldShell label="Account type">
                <Select
                  value={acct.type}
                  onValueChange={(v) => {
                    const newType = v as AccountType;
                    const patch: Partial<Account> = { type: newType };
                    if (isFixedInterest(newType)) {
                      patch.allocation = CASH_ALLOCATION;
                      patch.fixedAnnualReturn = DEFAULT_FIXED_RATES[newType] ?? 0.04;
                    } else {
                      patch.fixedAnnualReturn = null;
                      if (isFixedInterest(acct.type)) {
                        patch.allocation = { ...DEFAULT_ALLOCATION };
                      }
                    }
                    updateAccount(acct.id, patch);
                  }}
                  options={ACCOUNT_TYPE_OPTIONS}
                />
              </FieldShell>
            </div>

            <p className="text-caption leading-4 text-text-tertiary">
              {ACCOUNT_TYPE_DESCRIPTIONS[acct.type]}
            </p>

            {isMarried && (
              <FieldShell label="Owner">
                <Select
                  value={acct.owner}
                  onValueChange={(v) => updateAccount(acct.id, { owner: v as Owner })}
                  options={OWNER_OPTIONS}
                />
              </FieldShell>
            )}

            <div className="grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-2">
              <FieldShell label="Current balance">
                <TextInput
                  inputType="currency"
                  value={acct.balance || ""}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value.replace(/[^0-9.-]/g, ""));
                    updateAccount(acct.id, {
                      balance: isNaN(val) ? 0 : val,
                    });
                  }}
                  placeholder="0"
                />
              </FieldShell>
              <FieldShell
                label="Annual contribution"
                helper={
                  maxContribution != null && acct.annualContribution > maxContribution
                    ? `Above 2026 IRS limit of ${formatCurrency(maxContribution)} (engine accepts the value as-is; typo check?)`
                    : undefined
                }
              >
                <div className="flex gap-[var(--space-2)]">
                  <div className="flex-1">
                    <TextInput
                      inputType="currency"
                      value={acct.annualContribution || ""}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value.replace(/[^0-9.-]/g, ""));
                        updateAccount(acct.id, {
                          annualContribution: isNaN(val) ? 0 : val,
                        });
                      }}
                      placeholder="0"
                    />
                  </div>
                  {maxContribution != null && acct.annualContribution !== maxContribution && (
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => updateAccount(acct.id, { annualContribution: maxContribution })}
                      title={`Fill 2026 max (${formatCurrency(maxContribution)})`}
                    >
                      Max
                    </Button>
                  )}
                </div>
              </FieldShell>
            </div>

            {(acct.type === "taxable" || acct.type === "i_bonds") && (
              <FieldShell
                label="Cost basis"
                helper={
                  acct.type === "i_bonds"
                    ? "Original purchase amount. Withdrawal gain over basis is taxed as ordinary income."
                    : undefined
                }
              >
                <TextInput
                  inputType="currency"
                  value={acct.costBasis || ""}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value.replace(/[^0-9.-]/g, ""));
                    updateAccount(acct.id, {
                      costBasis: isNaN(val) ? 0 : val,
                    });
                  }}
                  placeholder="0"
                />
              </FieldShell>
            )}

            {is401k(acct.type) && (
              <FieldShell label="Employer match (annual)">
                <TextInput
                  inputType="currency"
                  value={acct.employerMatch || ""}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value.replace(/[^0-9.-]/g, ""));
                    updateAccount(acct.id, {
                      employerMatch: isNaN(val) ? 0 : val,
                    });
                  }}
                  placeholder="0"
                />
              </FieldShell>
            )}

            <FieldShell label="Stop contributions">
              <div className="flex flex-col gap-[var(--space-3)]">
                <LabeledSwitch
                  checked={stopsAtRetirement}
                  onCheckedChange={(v) =>
                    updateAccount(acct.id, {
                      contributionEndAge: v
                        ? ownerRetirementAge
                        : Math.max(ownerRetirementAge - 1, ownerCurrentAge),
                    })
                  }
                  label={`Stop at retirement (age ${ownerRetirementAge})`}
                />
                {!stopsAtRetirement && (
                  <Slider
                    value={[Math.max(acct.contributionEndAge, ownerCurrentAge)]}
                    onValueChange={([v]) => updateAccount(acct.id, { contributionEndAge: v })}
                    min={ownerCurrentAge}
                    max={Math.max(scenario.profile.planningHorizonAge, ownerCurrentAge)}
                    step={1}
                    formatValue={(v) => `Age ${v}`}
                  />
                )}
              </div>
            </FieldShell>

            {isFixedInterest(acct.type) ? (
              <FieldShell label="Annual interest rate (APY)">
                <TextInput
                  inputType="percent"
                  value={acct.fixedAnnualReturn != null ? (acct.fixedAnnualReturn * 100).toFixed(1) : ""}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value.replace(/[^0-9.-]/g, ""));
                    updateAccount(acct.id, {
                      fixedAnnualReturn: isNaN(val) ? 0 : val / 100,
                    });
                  }}
                  placeholder="4.5"
                />
              </FieldShell>
            ) : (
              <>
                <FullAllocationEditor
                  allocation={acct.allocation}
                  equityPct={equityPct}
                  onSimpleChange={(v) =>
                    updateAccount(acct.id, { allocation: allocationFromEquityPct(v / 100) })
                  }
                  onFullChange={(allocation) => updateAccount(acct.id, { allocation })}
                />

                <FieldShell label="Use age-based glide path">
                  <LabeledSwitch
                    checked={acct.useGlidePath}
                    onCheckedChange={(enabled) => {
                      const patch: Partial<Account> = { useGlidePath: enabled };
                      if (enabled && acct.glidePath.length === 0) {
                        // Default 3-point glide: current allocation now,
                        // 60/40 at retirement, 40/60 ten years after.
                        patch.glidePath = [
                          { age: scenario.profile.retirementAge - 10, allocation: { ...acct.allocation } },
                          {
                            age: scenario.profile.retirementAge,
                            allocation: allocationFromEquityPct(0.6),
                          },
                          {
                            age: scenario.profile.retirementAge + 10,
                            allocation: allocationFromEquityPct(0.4),
                          },
                        ];
                      }
                      updateAccount(acct.id, patch);
                    }}
                    label="Gradually shift to bonds as you age"
                  />
                </FieldShell>

                {acct.useGlidePath && acct.glidePath.length > 0 && (
                  <Card variant="sunken" className="flex flex-col gap-[var(--space-3)] p-[var(--space-4)]">
                    <p className="text-overline text-text-tertiary">Glide-path control points (% stocks)</p>
                    {acct.glidePath.map((pt, idx) => (
                      <div key={idx} className="flex items-end gap-[var(--space-3)]">
                        <FieldShell label="Age" className="w-24">
                          <TextInput
                            inputType="number"
                            aria-label={`Control point ${idx + 1} age`}
                            value={String(pt.age)}
                            onChange={(e) => {
                              const v = parseInt(e.target.value);
                              if (isNaN(v)) return;
                              const newPath = acct.glidePath
                                .map((p, i) => (i === idx ? { ...p, age: v } : p))
                                .sort((a, b) => a.age - b.age);
                              updateAccount(acct.id, { glidePath: newPath });
                            }}
                          />
                        </FieldShell>
                        <FieldShell label="% stocks" className="flex-1">
                          <Slider
                            value={[Math.round(equityPctFromAllocation(pt.allocation) * 100)]}
                            onValueChange={([v]) => {
                              const newPath = acct.glidePath.map((p, i) =>
                                i === idx ? { ...p, allocation: allocationFromEquityPct(v / 100) } : p,
                              );
                              updateAccount(acct.id, { glidePath: newPath });
                            }}
                            min={0}
                            max={100}
                            step={5}
                            formatValue={(v) => `${v}%`}
                          />
                        </FieldShell>
                        <Button
                          variant="icon-only"
                          size="sm"
                          aria-label={`Remove glide-path control point at age ${pt.age}`}
                          disabled={acct.glidePath.length <= 2}
                          onClick={() => {
                            // Keep at least 2 control points so the path remains
                            // a meaningful curve; otherwise the user should
                            // disable the glide path entirely.
                            if (acct.glidePath.length <= 2) return;
                            updateAccount(acct.id, {
                              glidePath: acct.glidePath.filter((_, i) => i !== idx),
                            });
                          }}
                          icon={<X size={14} />}
                        />
                      </div>
                    ))}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const last = acct.glidePath[acct.glidePath.length - 1];
                        const newAge = last.age + 5;
                        const newPoint = { age: newAge, allocation: { ...last.allocation } };
                        updateAccount(acct.id, {
                          glidePath: [...acct.glidePath, newPoint],
                        });
                      }}
                      icon={<Plus size={14} />}
                    >
                      Add Point
                    </Button>
                  </Card>
                )}
              </>
            )}
          </Card>
        );
      })}

      <Button variant="secondary" onClick={addAccount} icon={<Plus size={16} />}>
        Add Account
      </Button>
    </div>
  );
}

const ASSET_CLASS_LABELS: Array<{ key: keyof typeof DEFAULT_ALLOCATION; label: string }> = [
  { key: "usLargeCap", label: "US Large Cap" },
  { key: "usSmallCap", label: "US Small Cap" },
  { key: "intlDeveloped", label: "International Developed" },
  { key: "intlEmerging", label: "International Emerging" },
  { key: "usBonds", label: "US Bonds" },
  { key: "tips", label: "TIPS" },
  { key: "cash", label: "Cash" },
];

function FullAllocationEditor({
  allocation,
  equityPct,
  onSimpleChange,
  onFullChange,
}: {
  allocation: typeof DEFAULT_ALLOCATION;
  equityPct: number;
  onSimpleChange: (equityPct: number) => void;
  onFullChange: (allocation: typeof DEFAULT_ALLOCATION) => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const total = ASSET_CLASS_LABELS.reduce((sum, { key }) => sum + allocation[key], 0);

  if (!advanced) {
    return (
      <FieldShell label="Asset allocation">
        <Slider
          value={[Math.round(equityPct * 100)]}
          onValueChange={([v]) => onSimpleChange(v)}
          min={0}
          max={100}
          step={5}
          formatValue={(v) => `${v}% stocks / ${100 - v}% bonds`}
        />
        <Button variant="tertiary" size="sm" className="self-start" onClick={() => setAdvanced(true)}>
          Switch to per-asset-class editor
        </Button>
      </FieldShell>
    );
  }

  return (
    <Card variant="sunken" className="flex flex-col gap-[var(--space-3)] p-[var(--space-4)]">
      <div className="flex items-center justify-between">
        <span className="text-body-sm font-medium text-text-primary">Allocation by asset class</span>
        <Button variant="ghost" size="sm" onClick={() => setAdvanced(false)}>
          Use simple slider
        </Button>
      </div>
      {ASSET_CLASS_LABELS.map(({ key, label }) => (
        <div
          key={key}
          className="flex flex-col gap-[var(--space-2)] sm:flex-row sm:items-center sm:gap-[var(--space-3)]"
        >
          <span className="text-body-sm text-text-secondary sm:w-44 sm:shrink-0">{label}</span>
          <div className="flex-1">
            <Slider
              value={[Math.round(allocation[key] * 100)]}
              onValueChange={([v]) => onFullChange({ ...allocation, [key]: v / 100 })}
              min={0}
              max={100}
              step={5}
              formatValue={(v) => `${v}%`}
            />
          </div>
        </div>
      ))}
      <p
        className={cn(
          "border-t border-[var(--color-border-subtle)] pt-[var(--space-2)] text-caption",
          Math.abs(total - 1) > 0.005 ? "text-[var(--color-danger)]" : "text-text-tertiary",
        )}
      >
        Total: {(total * 100).toFixed(1)}%{Math.abs(total - 1) > 0.005 ? " (must sum to 100%)" : ""}
      </p>
    </Card>
  );
}
