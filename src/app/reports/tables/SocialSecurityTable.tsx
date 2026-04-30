import { useMemo } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/primitives";
import { formatCurrency } from "@/lib/format";
import { claimingAdjustment } from "@/engine/social-security";
import type { Scenario } from "@/models";
import type { Density } from "./types";

const CLAIMING_AGES = [62, 63, 64, 65, 66, 67, 68, 69, 70];

interface Props {
  scenario: Scenario;
  density: Density;
}

export function SocialSecurityTable({ scenario, density }: Props) {
  const ss = scenario.socialSecurity;

  const rows = useMemo(() => {
    const fra = ss.self.fra;
    const fraMonthly = ss.self.fraMonthlyBenefit;
    const baseline = fraMonthly * 12; // annual at FRA, today's dollars
    return CLAIMING_AGES.map((age) => {
      const adj = claimingAdjustment(age, fra);
      const monthly = fraMonthly * adj;
      const annual = monthly * 12;
      // Lifetime by age 90 (rough breakeven proxy): annual × (90 − claim)
      const lifetimeTo90 = annual * Math.max(0, 90 - age);
      return {
        age,
        adjustment: adj,
        monthly,
        annual,
        lifetimeTo90,
        diffVsFra: annual - baseline,
      };
    });
  }, [ss]);

  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-text-secondary">
        Comparison of Social Security claiming ages for {scenario.profile.name || "you"} (FRA = age{" "}
        {ss.self.fra.toFixed(0)}). Amounts are in today's dollars at FRA monthly benefit of{" "}
        <span className="font-medium text-text-primary">{formatCurrency(ss.self.fraMonthlyBenefit)}</span>/mo.
      </p>
      <div className="overflow-hidden rounded-md border border-[var(--color-border-subtle)]">
        <Table density={density}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Claim Age</TableHeaderCell>
              <TableHeaderCell numeric>Adjustment</TableHeaderCell>
              <TableHeaderCell numeric>Monthly</TableHeaderCell>
              <TableHeaderCell numeric>Annual</TableHeaderCell>
              <TableHeaderCell numeric>vs. FRA Annual</TableHeaderCell>
              <TableHeaderCell numeric>Lifetime to age 90</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.age}
                className={r.age === ss.self.claimingAge ? "bg-[var(--color-primary-soft)]/30" : undefined}
              >
                <TableCell className="font-medium">
                  <span className="inline-flex items-baseline gap-[var(--space-2)]">
                    {r.age}
                    {r.age === ss.self.claimingAge && (
                      <span className="text-overline text-text-tertiary">planned</span>
                    )}
                  </span>
                </TableCell>
                <TableCell numeric>{fmtPct(r.adjustment)}</TableCell>
                <TableCell numeric>{formatCurrency(r.monthly)}</TableCell>
                <TableCell numeric>{formatCurrency(r.annual)}</TableCell>
                <TableCell numeric className={r.diffVsFra < 0 ? "text-[var(--color-danger)]" : undefined}>
                  {r.diffVsFra >= 0 ? "+" : ""}
                  {formatCurrency(r.diffVsFra)}
                </TableCell>
                <TableCell numeric className="font-medium">
                  {formatCurrency(r.lifetimeTo90)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-caption text-text-tertiary">
        Lifetime totals are nominal (no COLA, no discounting) and assume living to age 90, useful as a
        breakeven proxy. Configure your COLA assumption in the Assumptions tab.
      </p>
    </div>
  );
}
