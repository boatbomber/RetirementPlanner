import { useCallback, useMemo } from "react";
import { Download } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  Button,
} from "@/components/primitives";
import { formatCurrency } from "@/lib/format";
import { toCsv, downloadCsv } from "@/lib/csv";
import type { AccountBalanceSeries } from "@/models/results";
import type { Account } from "@/models/account";
import type { Density } from "./types";

interface Props {
  series: AccountBalanceSeries[];
  accounts: Account[];
  density: Density;
  retirementAge: number;
}

export function AccountBalancesTable({ series, accounts, density, retirementAge }: Props) {
  const labelFor = useCallback((id: string) => accounts.find((a) => a.id === id)?.label ?? id, [accounts]);

  // First series defines the year/age axis
  const ages = useMemo(() => series[0]?.byYear.map((p) => p.age) ?? [], [series]);
  const years = useMemo(() => series[0]?.byYear.map((p) => p.year) ?? [], [series]);

  const handleExport = useCallback(() => {
    const headers = ["Age", "Year", ...series.map((s) => `${labelFor(s.accountId)} (median)`)];
    const csvRows = ages.map((age, i) => [
      age,
      years[i],
      ...series.map((s) => Math.round(s.byYear[i]?.p50 ?? 0)),
    ]);
    downloadCsv(toCsv(headers, csvRows), "account-balances.csv");
  }, [series, ages, years, labelFor]);

  if (series.length === 0) {
    return <p className="text-body-sm text-text-tertiary">No accounts to display.</p>;
  }

  const fmt = (v: number) => formatCurrency(v, { compact: true });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={handleExport} icon={<Download size={14} />}>
          Export CSV
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border border-[var(--color-border-subtle)]">
        <Table density={density}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Age</TableHeaderCell>
              <TableHeaderCell numeric>Year</TableHeaderCell>
              {series.map((s) => (
                <TableHeaderCell key={s.accountId} numeric>
                  {labelFor(s.accountId)}
                </TableHeaderCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ages.map((age, i) => (
              <TableRow
                key={age}
                className={age === retirementAge ? "bg-[var(--color-primary-soft)]/30" : undefined}
              >
                <TableCell className="font-medium">{age}</TableCell>
                <TableCell numeric>{years[i]}</TableCell>
                {series.map((s) => (
                  <TableCell key={s.accountId} numeric>
                    {fmt(s.byYear[i]?.p50 ?? 0)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
