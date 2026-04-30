import { useCallback } from "react";
import type { EditorProps } from "./types";
import type {
  WithdrawalStrategy,
  WithdrawalStrategyType,
  WithdrawalOrder,
  WithdrawalOrderType,
  StrategyParams,
  FixedRealParams,
  GuytonKlingerParams,
  VanguardDynamicParams,
  RmdMethodParams,
  ArvaParams,
  KitcesRatchetParams,
  RiskBasedParams,
} from "@/models/withdrawal";
import type { AccountType } from "@/models/account";
import { FieldShell } from "@/components/primitives/Input/FieldShell";
import { TextInput } from "@/components/primitives/Input/TextInput";
import { Select } from "@/components/primitives/Input/Select";
import { LabeledSwitch } from "@/components/primitives/Input/Switch";
import { Slider } from "@/components/primitives/Input/Slider";
import { Card } from "@/components/primitives/Card";
import { Button } from "@/components/primitives/Button";
import { ChevronUp, ChevronDown } from "lucide-react";

const STRATEGY_OPTIONS: Array<{
  value: WithdrawalStrategyType;
  label: string;
}> = [
  { value: "fixed_real", label: "Fixed Real (Bengen 4%)" },
  { value: "guyton_klinger", label: "Guyton-Klinger Guardrails" },
  { value: "vanguard_dynamic", label: "Vanguard Dynamic Spending" },
  { value: "vpw", label: "Variable Percentage Withdrawal (VPW)" },
  { value: "rmd_method", label: "RMD Method" },
  { value: "arva", label: "ARVA (Annuity-Based)" },
  { value: "kitces_ratchet", label: "Kitces Ratchet" },
  { value: "risk_based", label: "Risk-Based Dynamic" },
];

const STRATEGY_DESCRIPTIONS: Record<WithdrawalStrategyType, string> = {
  fixed_real:
    'Withdraw a fixed percentage of your initial portfolio, adjusted for inflation each year. The classic "4% rule" from William Bengen\'s 1994 research.',
  guyton_klinger:
    "Dynamic guardrails that raise or cut spending by 10% when withdrawal rate drifts 20% above or below the initial rate. Skips inflation adjustments after down years.",
  vanguard_dynamic:
    "Adjusts spending each year with a configurable ceiling and floor on real changes from the prior year. Smooths out volatility while adapting to market conditions.",
  vpw: "Withdraws a percentage of current balance based on age and allocation. Percentage increases with age. Mathematically cannot deplete the portfolio.",
  rmd_method:
    "Divides portfolio balance by remaining life expectancy (IRS Uniform Lifetime Table). Optionally smoothed over a configurable window to reduce volatility.",
  arva: "Calculates spending as an annuity payment (PMT formula) over remaining years at a conservative real discount rate.",
  kitces_ratchet:
    "Starts at 4% of initial balance. Ratchets up by 10% when portfolio grows significantly above its starting value. Never cuts spending.",
  risk_based:
    "Adjusts spending to keep estimated success probability within a target band (70-95%). Uses analytical approximation for speed.",
};

const ORDER_OPTIONS: Array<{ value: WithdrawalOrderType; label: string }> = [
  { value: "conventional", label: "Conventional" },
  { value: "bracket_filling", label: "Bracket-Filling" },
  { value: "roth_first", label: "Roth First" },
  { value: "custom", label: "Custom Order" },
];

const ORDER_DESCRIPTIONS: Record<string, string> = {
  conventional:
    "Withdraw from taxable accounts first, then traditional IRAs/401(k)s, then Roth accounts last. Preserves Roth's tax-free growth longest.",
  bracket_filling:
    "Strategically withdraw from traditional accounts to fill lower tax brackets early, preserving Roth for later when tax rates may be higher.",
  roth_first: "Withdraw from Roth accounts first. Useful if you expect much lower tax rates in later years.",
  custom:
    "Define your own ordering of account types. Drag the chips below to set the priority. Earlier types are drawn first.",
};

// Order mirrors the AccountType source enum in src/models/account.ts so the
// custom-order picker reflects a stable, expected order.
// HSA and 529 are intentionally excluded. They have special tax-free
// treatment for medical / education that the generic withdrawal step doesn't
// honor; including them would silently let the engine consume them untaxed
// for ordinary retirement spending.
const ALL_ACCOUNT_TYPES: AccountType[] = [
  "traditional_ira",
  "traditional_401k",
  "roth_ira",
  "roth_401k",
  "taxable",
  "hysa",
  "money_market",
  "cd",
  "i_bonds",
];

const BRACKET_OPTIONS = [
  { value: "0.10", label: "10% bracket" },
  { value: "0.12", label: "12% bracket" },
  { value: "0.22", label: "22% bracket" },
  { value: "0.24", label: "24% bracket" },
  { value: "0.32", label: "32% bracket" },
];

const DEFAULT_PARAMS: Record<WithdrawalStrategyType, Record<string, unknown>> = {
  fixed_real: { withdrawalRate: 0.04 },
  guyton_klinger: {
    initialRate: 0.05,
    // Drift band relative to initial rate. Spec §4.8 default is 20%, so the
    // ceiling fires when WR exceeds initialRate × 1.20 (6% if initial = 5%).
    ceilingMultiplier: 0.2,
    floorMultiplier: 0.2,
    adjustmentPercent: 0.1,
  },
  vanguard_dynamic: {
    initialRate: 0.045,
    ceilingPercent: 0.05,
    floorPercent: 0.025,
  },
  vpw: {},
  rmd_method: { smoothingYears: 3 },
  arva: { realDiscountRate: 0.02 },
  kitces_ratchet: {
    initialRate: 0.04,
    ratchetThreshold: 0.5,
    ratchetIncrease: 0.1,
  },
  risk_based: {
    targetSuccessLow: 0.7,
    targetSuccessHigh: 0.95,
    adjustmentStep: 0.05,
    initialRate: 0.04,
  },
};

export function WithdrawalEditor({ scenario, onUpdate }: EditorProps) {
  const strategy = scenario.withdrawalStrategy;
  const order = scenario.withdrawalOrder;

  const setStrategy = useCallback(
    (next: WithdrawalStrategy) => {
      onUpdate({ withdrawalStrategy: next });
    },
    [onUpdate],
  );

  const updateOrder = useCallback(
    (patch: Partial<WithdrawalOrder>) => {
      onUpdate({ withdrawalOrder: { ...order, ...patch } });
    },
    [order, onUpdate],
  );

  const handleStrategyTypeChange = useCallback(
    (type: string) => {
      const t = type as WithdrawalStrategyType;
      // Cast: TS can't correlate a runtime-selected `t` with the matching
      // `params` variant. Each entry in DEFAULT_PARAMS is the right shape
      // for its key, so this cast is sound.
      const next = {
        type: t,
        params: DEFAULT_PARAMS[t],
        useSpendingSmile: strategy.useSpendingSmile,
      } as WithdrawalStrategy;
      setStrategy(next);
    },
    [strategy.useSpendingSmile, setStrategy],
  );

  const handleParamsChange = useCallback(
    (params: StrategyParams) => {
      // Cast: StrategyParamFields hands back the union; correlation between
      // the active strategy.type and the params shape is guaranteed by the
      // dispatch in StrategyParamFields itself.
      setStrategy({ ...strategy, params } as WithdrawalStrategy);
    },
    [strategy, setStrategy],
  );

  const handleSmileChange = useCallback(
    (useSpendingSmile: boolean) => {
      setStrategy({ ...strategy, useSpendingSmile });
    },
    [strategy, setStrategy],
  );

  return (
    <div className="flex flex-col gap-[var(--space-5)]">
      <Card variant="surface" className="flex flex-col gap-[var(--space-5)] p-[var(--space-5)]">
        <h2 className="text-heading-sm font-semibold text-text-primary">Withdrawal Strategy</h2>

        <FieldShell label="Strategy type">
          <Select value={strategy.type} onValueChange={handleStrategyTypeChange} options={STRATEGY_OPTIONS} />
        </FieldShell>

        <p className="text-caption leading-relaxed text-text-tertiary">
          {STRATEGY_DESCRIPTIONS[strategy.type]}
        </p>

        <StrategyParamFields type={strategy.type} params={strategy.params} onChange={handleParamsChange} />

        <LabeledSwitch
          checked={strategy.useSpendingSmile}
          onCheckedChange={handleSmileChange}
          label="Apply spending smile (lower spending mid-retirement)"
        />
      </Card>

      <Card variant="surface" className="flex flex-col gap-[var(--space-5)] p-[var(--space-5)]">
        <h2 className="text-heading-sm font-semibold text-text-primary">Withdrawal Order</h2>

        <FieldShell label="Account withdrawal order">
          <Select
            value={order.type}
            onValueChange={(v) => {
              const t = v as WithdrawalOrderType;
              const patch: Partial<WithdrawalOrder> = { type: t };
              if (t === "custom" && order.customOrder.length === 0) {
                patch.customOrder = [...ALL_ACCOUNT_TYPES];
              }
              updateOrder(patch);
            }}
            options={ORDER_OPTIONS}
          />
        </FieldShell>

        <p className="text-caption leading-relaxed text-text-tertiary">{ORDER_DESCRIPTIONS[order.type]}</p>

        {order.type === "custom" && (
          <CustomOrderEditor
            customOrder={order.customOrder}
            onChange={(customOrder) => updateOrder({ customOrder: customOrder as AccountType[] })}
          />
        )}

        {order.type === "bracket_filling" && (
          <FieldShell
            label="Fill Traditional withdrawals up to bracket"
            helper="Cap each year's Traditional pull at the top of this bracket; pull the rest from Taxable."
          >
            <Select
              value={String(order.bracketFillingTargetBracket)}
              onValueChange={(v) => updateOrder({ bracketFillingTargetBracket: parseFloat(v) })}
              options={BRACKET_OPTIONS}
            />
          </FieldShell>
        )}

        <Card variant="sunken" className="flex flex-col gap-[var(--space-4)] p-[var(--space-5)]">
          <LabeledSwitch
            checked={order.rothConversionEnabled}
            onCheckedChange={(v) => updateOrder({ rothConversionEnabled: v })}
            label={
              <span className="text-body-sm font-medium text-text-primary">Enable Roth conversions</span>
            }
          />

          {order.rothConversionEnabled && (
            <FieldShell
              label="Convert to fill up to bracket"
              helper="Convert traditional IRA to Roth each year to fill this tax bracket"
            >
              <Select
                value={String(order.rothConversionTargetBracket)}
                onValueChange={(v) => updateOrder({ rothConversionTargetBracket: parseFloat(v) })}
                options={BRACKET_OPTIONS}
              />
            </FieldShell>
          )}
        </Card>
      </Card>
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  taxable: "Taxable Brokerage",
  hysa: "High-Yield Savings",
  money_market: "Money Market",
  cd: "Certificate of Deposit",
  i_bonds: "I Bonds",
  traditional_ira: "Traditional IRA",
  traditional_401k: "Traditional 401(k)",
  roth_ira: "Roth IRA",
  roth_401k: "Roth 401(k)",
  hsa: "HSA",
  "529": "529 Plan",
};

function CustomOrderEditor({
  customOrder,
  onChange,
}: {
  customOrder: readonly string[];
  onChange: (order: string[]) => void;
}) {
  const move = (idx: number, delta: number) => {
    const next = [...customOrder];
    const swap = idx + delta;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange(next);
  };

  return (
    <Card variant="sunken" className="p-[var(--space-3)]">
      <ol className="flex flex-col gap-[var(--space-2)]">
        {customOrder.map((t, i) => (
          <li
            key={t}
            className="flex items-center justify-between rounded-sm bg-surface px-[var(--space-3)] py-[var(--space-2)] text-body-sm"
          >
            <span>
              <span className="text-text-tertiary">{i + 1}.</span> {TYPE_LABELS[t] ?? t}
            </span>
            <span className="flex gap-[var(--space-1)]">
              <Button
                variant="icon-only"
                size="sm"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="Move up"
                icon={<ChevronUp size={14} />}
              />
              <Button
                variant="icon-only"
                size="sm"
                onClick={() => move(i, 1)}
                disabled={i === customOrder.length - 1}
                aria-label="Move down"
                icon={<ChevronDown size={14} />}
              />
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function StrategyParamFields({
  type,
  params,
  onChange,
}: {
  type: WithdrawalStrategyType;
  params: WithdrawalStrategy["params"];
  onChange: (params: WithdrawalStrategy["params"]) => void;
}) {
  const update = (patch: Record<string, unknown>) => {
    onChange({ ...params, ...patch } as WithdrawalStrategy["params"]);
  };

  switch (type) {
    case "fixed_real": {
      const p = params as FixedRealParams;
      return (
        <FieldShell label="Withdrawal rate">
          <Slider
            value={[Math.round(p.withdrawalRate * 1000) / 10]}
            onValueChange={([v]) => update({ withdrawalRate: v / 100 })}
            min={2}
            max={6}
            step={0.1}
            formatValue={(v) => `${v}%`}
          />
        </FieldShell>
      );
    }

    case "guyton_klinger": {
      const p = params as GuytonKlingerParams;
      return (
        <div className="flex flex-col gap-[var(--space-5)]">
          <FieldShell label="Initial withdrawal rate">
            <Slider
              value={[Math.round(p.initialRate * 1000) / 10]}
              onValueChange={([v]) => update({ initialRate: v / 100 })}
              min={3}
              max={7}
              step={0.1}
              formatValue={(v) => `${v}%`}
            />
          </FieldShell>
          <div className="grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-2">
            <FieldShell
              label="Ceiling drift band"
              helper="Cut spending when withdrawal rate drifts this far above initial rate"
            >
              <TextInput
                inputType="percent"
                value={String(Math.round(p.ceilingMultiplier * 100))}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) update({ ceilingMultiplier: val / 100 });
                }}
                placeholder="20"
              />
            </FieldShell>
            <FieldShell
              label="Floor drift band"
              helper="Raise spending when withdrawal rate drifts this far below initial rate"
            >
              <TextInput
                inputType="percent"
                value={String(Math.round(p.floorMultiplier * 100))}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) update({ floorMultiplier: val / 100 });
                }}
                placeholder="20"
              />
            </FieldShell>
          </div>
          <FieldShell label="Adjustment size">
            <Slider
              value={[Math.round(p.adjustmentPercent * 100)]}
              onValueChange={([v]) => update({ adjustmentPercent: v / 100 })}
              min={5}
              max={20}
              step={1}
              formatValue={(v) => `${v}%`}
            />
          </FieldShell>
        </div>
      );
    }

    case "vanguard_dynamic": {
      const p = params as VanguardDynamicParams;
      return (
        <div className="flex flex-col gap-[var(--space-5)]">
          <FieldShell label="Initial withdrawal rate">
            <Slider
              value={[Math.round(p.initialRate * 1000) / 10]}
              onValueChange={([v]) => update({ initialRate: v / 100 })}
              min={3}
              max={7}
              step={0.1}
              formatValue={(v) => `${v}%`}
            />
          </FieldShell>
          <div className="grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-2">
            <FieldShell label="Ceiling (max increase)">
              <Slider
                value={[Math.round(p.ceilingPercent * 100)]}
                onValueChange={([v]) => update({ ceilingPercent: v / 100 })}
                min={1}
                max={15}
                step={0.5}
                formatValue={(v) => `+${v}%`}
              />
            </FieldShell>
            <FieldShell label="Floor (max decrease)">
              <Slider
                value={[Math.round(p.floorPercent * 100)]}
                onValueChange={([v]) => update({ floorPercent: v / 100 })}
                min={1}
                max={10}
                step={0.5}
                formatValue={(v) => `-${v}%`}
              />
            </FieldShell>
          </div>
        </div>
      );
    }

    case "vpw":
      return (
        <p className="text-body-sm text-text-secondary">
          VPW uses a lookup table based on age and allocation. No additional parameters needed.
        </p>
      );

    case "rmd_method": {
      const p = params as RmdMethodParams;
      return (
        <FieldShell
          label="Smoothing window (years)"
          helper="Average withdrawals over this many years to reduce volatility"
        >
          <Slider
            value={[p.smoothingYears]}
            onValueChange={([v]) => update({ smoothingYears: v })}
            min={1}
            max={5}
            step={1}
            formatValue={(v) => `${v} year${v > 1 ? "s" : ""}`}
          />
        </FieldShell>
      );
    }

    case "arva": {
      const p = params as ArvaParams;
      return (
        <FieldShell label="Real discount rate" helper="Conservative rate used in annuity calculation">
          <Slider
            value={[Math.round(p.realDiscountRate * 1000) / 10]}
            onValueChange={([v]) => update({ realDiscountRate: v / 100 })}
            min={0}
            max={5}
            step={0.1}
            formatValue={(v) => `${v}%`}
          />
        </FieldShell>
      );
    }

    case "kitces_ratchet": {
      const p = params as KitcesRatchetParams;
      return (
        <div className="flex flex-col gap-[var(--space-5)]">
          <FieldShell label="Initial withdrawal rate">
            <Slider
              value={[Math.round(p.initialRate * 1000) / 10]}
              onValueChange={([v]) => update({ initialRate: v / 100 })}
              min={3}
              max={6}
              step={0.1}
              formatValue={(v) => `${v}%`}
            />
          </FieldShell>
          <FieldShell
            label="Growth threshold for ratchet"
            helper="Portfolio must exceed initial value by this much to trigger a ratchet"
          >
            <Slider
              value={[Math.round(p.ratchetThreshold * 100)]}
              onValueChange={([v]) => update({ ratchetThreshold: v / 100 })}
              min={10}
              max={100}
              step={5}
              formatValue={(v) => `${v}%`}
            />
          </FieldShell>
          <FieldShell label="Ratchet increase">
            <Slider
              value={[Math.round(p.ratchetIncrease * 100)]}
              onValueChange={([v]) => update({ ratchetIncrease: v / 100 })}
              min={5}
              max={25}
              step={1}
              formatValue={(v) => `${v}%`}
            />
          </FieldShell>
        </div>
      );
    }

    case "risk_based": {
      const p = params as RiskBasedParams;
      return (
        <div className="flex flex-col gap-[var(--space-4)]">
          <FieldShell label="Initial withdrawal rate">
            <Slider
              value={[Math.round((p.initialRate ?? 0.04) * 1000) / 10]}
              onValueChange={([v]) => update({ initialRate: v / 100 })}
              min={2}
              max={6}
              step={0.1}
              formatValue={(v) => `${v}%`}
            />
          </FieldShell>
          <div className="grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-2">
            <FieldShell label="Target success range (low)">
              <Slider
                value={[Math.round(p.targetSuccessLow * 100)]}
                onValueChange={([v]) => update({ targetSuccessLow: v / 100 })}
                min={50}
                max={90}
                step={5}
                formatValue={(v) => `${v}%`}
              />
            </FieldShell>
            <FieldShell label="Target success range (high)">
              <Slider
                value={[Math.round(p.targetSuccessHigh * 100)]}
                onValueChange={([v]) => update({ targetSuccessHigh: v / 100 })}
                min={80}
                max={99}
                step={1}
                formatValue={(v) => `${v}%`}
              />
            </FieldShell>
          </div>
          <FieldShell label="Adjustment step">
            <Slider
              value={[Math.round(p.adjustmentStep * 100)]}
              onValueChange={([v]) => update({ adjustmentStep: v / 100 })}
              min={1}
              max={10}
              step={1}
              formatValue={(v) => `${v}%`}
            />
          </FieldShell>
          <p className="text-caption text-text-tertiary">
            Expected return and volatility are computed from your current allocation × CMA.
          </p>
        </div>
      );
    }

    default:
      return null;
  }
}
