import { useCallback } from "react";
import { Download } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  useSortableTable,
  Button,
} from "@/components/primitives";
import { formatCurrency } from "@/lib/format";
import { toCsv, downloadCsv } from "@/lib/csv";
import type { YearlyPercentiles } from "@/models/results";
import type { Density } from "./types";

interface CashFlowRow {
  age: number;
  year: number;
  employmentIncome: number;
  ssIncome: number;
  otherIncome: number;
  totalIncome: number;
  totalSpending: number;
  taxes: number;
  netCashFlow: number;
  withdrawals: number;
  portfolioP25: number;
  portfolioP50: number;
  portfolioP75: number;
}

function buildRows(
  wealth: YearlyPercentiles[],
  income: YearlyPercentiles[],
  spending: YearlyPercentiles[],
  tax: YearlyPercentiles[],
  ssIncome: YearlyPercentiles[],
  withdrawals: YearlyPercentiles[],
): CashFlowRow[] {
  return wealth.map((w, i) => {
    const totalInc = income[i]?.p50 ?? 0;
    const ss = ssIncome[i]?.p50 ?? 0;
    const wd = withdrawals[i]?.p50 ?? 0;
    const spend = spending[i]?.p50 ?? 0;
    const taxes = tax[i]?.p50 ?? 0;
    // totalIncome from snapshot already includes SS, so back out employment
    // and other (non-SS, non-withdrawal) income for the breakdown columns.
    const nonSs = Math.max(0, totalInc - ss);
    return {
      age: w.age,
      year: w.year,
      // TODO: split out non-employment income once the engine tags income
      // type on snapshots. Until then, "Employment" is everything that isn't SS.
      employmentIncome: nonSs,
      ssIncome: ss,
      otherIncome: 0,
      totalIncome: totalInc,
      totalSpending: spend,
      taxes,
      netCashFlow: totalInc + wd - spend - taxes,
      withdrawals: wd,
      portfolioP25: w.p25,
      portfolioP50: w.p50,
      portfolioP75: w.p75,
    };
  });
}

interface Props {
  wealth: YearlyPercentiles[];
  income: YearlyPercentiles[];
  spending: YearlyPercentiles[];
  tax: YearlyPercentiles[];
  ssIncome: YearlyPercentiles[];
  withdrawals: YearlyPercentiles[];
  density: Density;
  retirementAge: number;
}

export function CashFlowTable({
  wealth,
  income,
  spending,
  tax,
  ssIncome,
  withdrawals,
  density,
  retirementAge,
}: Props) {
  const rows = buildRows(wealth, income, spending, tax, ssIncome, withdrawals);
  const { data, getSortProps } = useSortableTable(rows, {
    key: "age",
    direction: "asc",
  });
  const fmt = (v: number) => formatCurrency(v, { compact: true });

  const handleExport = useCallback(() => {
    const headers = [
      "Age",
      "Year",
      "Employment Income",
      "Social Security",
      "Other Income",
      "Total Income",
      "Total Spending",
      "Federal Taxes",
      "Net Cash Flow",
      "Portfolio Withdrawals",
      "Portfolio p25",
      "Portfolio p50",
      "Portfolio p75",
    ];
    const csvRows = rows.map((r) => [
      r.age,
      r.year,
      Math.round(r.employmentIncome),
      Math.round(r.ssIncome),
      Math.round(r.otherIncome),
      Math.round(r.totalIncome),
      Math.round(r.totalSpending),
      Math.round(r.taxes),
      Math.round(r.netCashFlow),
      Math.round(r.withdrawals),
      Math.round(r.portfolioP25),
      Math.round(r.portfolioP50),
      Math.round(r.portfolioP75),
    ]);
    downloadCsv(toCsv(headers, csvRows), "cash-flow.csv");
  }, [rows]);

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
              <TableHeaderCell {...getSortProps("age")}>Age</TableHeaderCell>
              <TableHeaderCell {...getSortProps("year")} numeric>
                Year
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("employmentIncome")} numeric>
                Employment
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("ssIncome")} numeric>
                Social Security
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("totalIncome")} numeric>
                Total Income
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("totalSpending")} numeric>
                Total Spending
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("taxes")} numeric>
                Federal Taxes
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("netCashFlow")} numeric>
                Net Cash Flow
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("withdrawals")} numeric>
                Withdrawals
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("portfolioP25")} numeric>
                Portfolio p25
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("portfolioP50")} numeric>
                Portfolio p50
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("portfolioP75")} numeric>
                Portfolio p75
              </TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((r) => (
              <TableRow
                key={r.age}
                className={r.age === retirementAge ? "bg-[var(--color-primary-soft)]/30" : undefined}
              >
                <TableCell className="font-medium">{r.age}</TableCell>
                <TableCell numeric>{r.year}</TableCell>
                <TableCell numeric>{fmt(r.employmentIncome)}</TableCell>
                <TableCell numeric>{fmt(r.ssIncome)}</TableCell>
                <TableCell numeric>{fmt(r.totalIncome)}</TableCell>
                <TableCell numeric>{fmt(r.totalSpending)}</TableCell>
                <TableCell numeric>{fmt(r.taxes)}</TableCell>
                <TableCell numeric className={r.netCashFlow < 0 ? "text-[var(--color-danger)]" : undefined}>
                  {fmt(r.netCashFlow)}
                </TableCell>
                <TableCell numeric>{fmt(r.withdrawals)}</TableCell>
                <TableCell numeric>{fmt(r.portfolioP25)}</TableCell>
                <TableCell numeric className="font-medium">
                  {fmt(r.portfolioP50)}
                </TableCell>
                <TableCell numeric>{fmt(r.portfolioP75)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
