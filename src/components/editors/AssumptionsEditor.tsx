import { useCallback, useState } from "react";
import type { EditorProps } from "./types";
import type {
  SimulationConfig,
  InflationMode,
  LongevityModel,
  MortalityTable,
  CMA,
  AssetClassCMA,
} from "@/models/simulation-config";
import { DEFAULT_CMA, DEFAULT_SIMULATION_CONFIG, ITERATION_OPTIONS } from "@/models/defaults";
import { FieldShell } from "@/components/primitives/Input/FieldShell";
import { TextInput } from "@/components/primitives/Input/TextInput";
import { Select } from "@/components/primitives/Input/Select";
import { LabeledSwitch } from "@/components/primitives/Input/Switch";
import { Card } from "@/components/primitives/Card";
import { Slider } from "@/components/primitives/Input/Slider";
import { Button } from "@/components/primitives/Button";
import { Modal } from "@/components/primitives/Modal";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "@/components/primitives/Table";
import {
  NOMINAL_DOLLARS_DISCLAIMER,
  TAX_MODELING_DISCLAIMER,
  ENGINE_SIMPLIFICATIONS_DISCLAIMER,
  MARKET_MODELING_DISCLAIMER,
} from "@/lib/disclaimers";

const INFLATION_OPTIONS = [
  { value: "stochastic", label: "Stochastic (AR(1) model)" },
  { value: "fixed", label: "Fixed rate" },
];

const LONGEVITY_OPTIONS = [
  { value: "fixed_age", label: "Fixed end age" },
  { value: "stochastic_mortality", label: "Stochastic mortality (Gompertz)" },
];

const MORTALITY_TABLE_OPTIONS = [
  { value: "ssa_period", label: "SSA Period (default)" },
  { value: "soa_rp2014", label: "SOA RP-2014" },
];

interface CMARow {
  key: keyof Omit<CMA, "stockBondCorrelationLow" | "stockBondCorrelationHigh">;
  label: string;
}

const CMA_ROWS: CMARow[] = [
  { key: "usLargeCap", label: "US Large Cap" },
  { key: "usSmallCap", label: "US Small Cap" },
  { key: "intlDeveloped", label: "Int'l Developed" },
  { key: "intlEmerging", label: "Int'l Emerging" },
  { key: "usBonds", label: "US Bonds" },
  { key: "tips", label: "TIPS" },
  { key: "cash", label: "Cash" },
];

export function AssumptionsEditor({ scenario, onUpdate }: EditorProps) {
  const config = scenario.simulationConfig;
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [confirmingResetAll, setConfirmingResetAll] = useState(false);

  const updateConfig = useCallback(
    (patch: Partial<SimulationConfig>) => {
      onUpdate({ simulationConfig: { ...config, ...patch } });
    },
    [config, onUpdate],
  );

  const updateCMA = useCallback(
    (key: string, patch: Partial<AssetClassCMA>) => {
      const cma = config.capitalMarketAssumptions;
      const current = cma[key as keyof CMA] as AssetClassCMA;
      onUpdate({
        simulationConfig: {
          ...config,
          capitalMarketAssumptions: {
            ...cma,
            [key]: { ...current, ...patch },
          },
        },
      });
    },
    [config, onUpdate],
  );

  const resetCMA = useCallback(() => {
    updateConfig({ capitalMarketAssumptions: structuredClone(DEFAULT_CMA) });
  }, [updateConfig]);

  const resetAll = useCallback(() => {
    onUpdate({ simulationConfig: structuredClone(DEFAULT_SIMULATION_CONFIG) });
  }, [onUpdate]);

  return (
    <div className="flex flex-col gap-[var(--space-5)]">
      <Card variant="surface" className="flex flex-col gap-[var(--space-3)] p-[var(--space-5)]">
        <h2 className="text-heading-sm font-semibold text-text-primary">Modeling Scope</h2>
        <p className="text-caption leading-relaxed text-text-tertiary">
          Reference for what the engine models, simplifies, and excludes. The fields below let you tune the
          stochastic parameters that drive the simulation. The text here describes the broader assumptions
          baked into the engine itself.
        </p>
        <p className="text-caption leading-relaxed text-text-tertiary">{NOMINAL_DOLLARS_DISCLAIMER}</p>
        <p className="text-caption leading-relaxed text-text-tertiary">{TAX_MODELING_DISCLAIMER}</p>
        <p className="text-caption leading-relaxed text-text-tertiary">{ENGINE_SIMPLIFICATIONS_DISCLAIMER}</p>
        <p className="text-caption leading-relaxed text-text-tertiary">{MARKET_MODELING_DISCLAIMER}</p>
      </Card>

      <Card variant="surface" className="flex flex-col gap-[var(--space-5)] p-[var(--space-5)]">
        <h2 className="text-heading-sm font-semibold text-text-primary">Simulation</h2>

        <FieldShell label="Iterations" helper="More iterations = more precise results but slower">
          <Select
            value={String(config.iterations)}
            onValueChange={(v) => updateConfig({ iterations: parseInt(v) })}
            options={ITERATION_OPTIONS}
          />
        </FieldShell>

        <FieldShell
          label="Random seed"
          helper="Set a seed for reproducible results, or leave blank for random"
        >
          <TextInput
            inputType="number"
            value={config.seed != null ? String(config.seed) : ""}
            onChange={(e) => {
              const val = e.target.value ? parseInt(e.target.value) : null;
              updateConfig({ seed: val !== null && !isNaN(val) ? val : null });
            }}
            placeholder="Random"
          />
        </FieldShell>
      </Card>

      <Card variant="surface" className="flex flex-col gap-[var(--space-5)] p-[var(--space-5)]">
        <h2 className="text-heading-sm font-semibold text-text-primary">Inflation</h2>

        <FieldShell label="Inflation model">
          <Select
            value={config.inflationMode}
            onValueChange={(v) => updateConfig({ inflationMode: v as InflationMode })}
            options={INFLATION_OPTIONS}
          />
        </FieldShell>

        {config.inflationMode === "fixed" ? (
          <FieldShell label="Fixed inflation rate">
            <Slider
              value={[Math.round(config.fixedInflationRate * 1000) / 10]}
              onValueChange={([v]) => updateConfig({ fixedInflationRate: v / 100 })}
              min={0}
              max={6}
              step={0.1}
              formatValue={(v) => `${v}%`}
            />
          </FieldShell>
        ) : (
          <Card variant="sunken" className="flex flex-col gap-[var(--space-4)] p-[var(--space-5)]">
            <p className="text-caption text-text-tertiary">
              AR(1) process: mean-reverting stochastic inflation with configurable persistence (φ) and shock
              size (σ).
            </p>
            <FieldShell label="Long-run mean">
              <Slider
                value={[Math.round(config.stochasticInflation.longRunMean * 1000) / 10]}
                onValueChange={([v]) =>
                  updateConfig({
                    stochasticInflation: {
                      ...config.stochasticInflation,
                      longRunMean: v / 100,
                    },
                  })
                }
                min={1}
                max={5}
                step={0.1}
                formatValue={(v) => `${v}%`}
              />
            </FieldShell>
            <FieldShell label="Persistence (φ)" helper="Higher = inflation shocks last longer">
              <Slider
                value={[Math.round(config.stochasticInflation.phi * 100)]}
                onValueChange={([v]) =>
                  updateConfig({
                    stochasticInflation: {
                      ...config.stochasticInflation,
                      phi: v / 100,
                    },
                  })
                }
                min={0}
                max={95}
                step={5}
                formatValue={(v) => `${v / 100}`}
              />
            </FieldShell>
            <FieldShell label="Shock std-dev (σ)" helper="Annual surprise size">
              <Slider
                value={[Math.round(config.stochasticInflation.sigma * 1000) / 10]}
                onValueChange={([v]) =>
                  updateConfig({
                    stochasticInflation: {
                      ...config.stochasticInflation,
                      sigma: v / 100,
                    },
                  })
                }
                min={0.5}
                max={5}
                step={0.1}
                formatValue={(v) => `${v}%`}
              />
            </FieldShell>
          </Card>
        )}
      </Card>

      <Card variant="surface" className="flex flex-col gap-[var(--space-5)] p-[var(--space-5)]">
        <h2 className="text-heading-sm font-semibold text-text-primary">Correlations</h2>
        <p className="text-caption text-text-tertiary">
          Stock-bond correlation switches to "high" when annual inflation exceeds the threshold below.
        </p>
        <FieldShell label="High-inflation regime threshold">
          <Slider
            value={[Math.round(config.inflationRegimeThreshold * 1000) / 10]}
            onValueChange={([v]) => updateConfig({ inflationRegimeThreshold: v / 100 })}
            min={1}
            max={6}
            step={0.1}
            formatValue={(v) => `${v}%`}
          />
        </FieldShell>
        <FieldShell label="Stock-bond correlation (low inflation)">
          <Slider
            value={[Math.round(config.capitalMarketAssumptions.stockBondCorrelationLow * 100)]}
            onValueChange={([v]) =>
              updateConfig({
                capitalMarketAssumptions: {
                  ...config.capitalMarketAssumptions,
                  stockBondCorrelationLow: v / 100,
                },
              })
            }
            min={-50}
            max={50}
            step={5}
            formatValue={(v) => `${(v / 100).toFixed(2)}`}
          />
        </FieldShell>
        <FieldShell label="Stock-bond correlation (high inflation)">
          <Slider
            value={[Math.round(config.capitalMarketAssumptions.stockBondCorrelationHigh * 100)]}
            onValueChange={([v]) =>
              updateConfig({
                capitalMarketAssumptions: {
                  ...config.capitalMarketAssumptions,
                  stockBondCorrelationHigh: v / 100,
                },
              })
            }
            min={-30}
            max={90}
            step={5}
            formatValue={(v) => `${(v / 100).toFixed(2)}`}
          />
        </FieldShell>
      </Card>

      <Card variant="surface" className="flex flex-col gap-[var(--space-5)] p-[var(--space-5)]">
        <h2 className="text-heading-sm font-semibold text-text-primary">Longevity</h2>

        <FieldShell label="Longevity model">
          <Select
            value={config.longevityModel}
            onValueChange={(v) => updateConfig({ longevityModel: v as LongevityModel })}
            options={LONGEVITY_OPTIONS}
          />
        </FieldShell>

        {config.longevityModel === "fixed_age" ? (
          <FieldShell label="Plan end age">
            <Slider
              value={[config.fixedEndAge]}
              onValueChange={([v]) => updateConfig({ fixedEndAge: v })}
              min={80}
              max={110}
              step={1}
              formatValue={(v) => `Age ${v}`}
            />
          </FieldShell>
        ) : (
          <div className="flex flex-col gap-[var(--space-4)]">
            <FieldShell label="Mortality table">
              <Select
                value={config.mortalityTable}
                onValueChange={(v) => updateConfig({ mortalityTable: v as MortalityTable })}
                options={MORTALITY_TABLE_OPTIONS}
              />
            </FieldShell>
            <LabeledSwitch
              checked={config.mortalityImprovement}
              onCheckedChange={(v) => updateConfig({ mortalityImprovement: v })}
              label="Apply mortality improvement factors"
            />
            <p className="text-caption text-text-tertiary">
              Stochastic mortality draws a random lifespan for each simulation run using Gompertz survival
              curves with sex-specific parameters.
            </p>
          </div>
        )}
      </Card>

      <Card variant="surface" className="flex flex-col gap-[var(--space-5)] p-[var(--space-5)]">
        <div className="flex items-center justify-between gap-[var(--space-3)]">
          <h2 className="text-heading-sm font-semibold text-text-primary">Capital Market Assumptions</h2>
          <Button
            variant="tertiary"
            size="sm"
            className="shrink-0 whitespace-nowrap"
            onClick={() => setConfirmingReset(true)}
          >
            Reset to defaults
          </Button>
        </div>

        <p className="text-caption text-text-tertiary">
          Real arithmetic mean returns and standard deviations for each asset class. These drive the Monte
          Carlo return generation.
        </p>

        <Table density="compact">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Asset Class</TableHeaderCell>
              <TableHeaderCell numeric>Return</TableHeaderCell>
              <TableHeaderCell numeric>Std Dev</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {CMA_ROWS.map((row) => {
              const asset = config.capitalMarketAssumptions[row.key] as AssetClassCMA;
              return (
                <TableRow key={row.key}>
                  <TableCell className="text-text-primary">{row.label}</TableCell>
                  <TableCell numeric>
                    <div className="flex justify-end">
                      <TextInput
                        inputType="percent"
                        value={(asset.arithmeticMean * 100).toFixed(1)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) updateCMA(row.key, { arithmeticMean: val / 100 });
                        }}
                        className="w-20 text-right"
                      />
                    </div>
                  </TableCell>
                  <TableCell numeric>
                    <div className="flex justify-end">
                      <TextInput
                        inputType="percent"
                        value={(asset.stdDev * 100).toFixed(1)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) updateCMA(row.key, { stdDev: val / 100 });
                        }}
                        className="w-20 text-right"
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <div className="flex justify-end pt-[var(--space-3)]">
        <Button variant="ghost" onClick={() => setConfirmingResetAll(true)}>
          Reset all assumptions to defaults
        </Button>
      </div>

      <Modal
        open={confirmingReset}
        onOpenChange={setConfirmingReset}
        title="Reset Capital Market Assumptions?"
        description="This will discard your current CMA values and restore the default returns and standard deviations."
      >
        <div className="flex justify-end gap-[var(--space-3)] pt-[var(--space-5)]">
          <Button variant="secondary" onClick={() => setConfirmingReset(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              resetCMA();
              setConfirmingReset(false);
            }}
          >
            Reset
          </Button>
        </div>
      </Modal>

      <Modal
        open={confirmingResetAll}
        onOpenChange={setConfirmingResetAll}
        title="Reset all assumptions?"
        description="This will discard every value on the Assumptions tab (iterations, seed, inflation, longevity, correlations, and CMAs) and restore the defaults."
      >
        <div className="flex justify-end gap-[var(--space-3)] pt-[var(--space-5)]">
          <Button variant="secondary" onClick={() => setConfirmingResetAll(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              resetAll();
              setConfirmingResetAll(false);
            }}
          >
            Reset all
          </Button>
        </div>
      </Modal>
    </div>
  );
}
