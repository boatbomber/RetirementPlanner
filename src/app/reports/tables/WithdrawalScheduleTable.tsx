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

interface Row {
  age: number;
  year: number;
  withdrawals: number;
  rmd: number;
  rothConversion: number;
  netWithdrawals: number;
}

function buildRows(
  withdrawals: YearlyPercentiles[],
  rmd: YearlyPercentiles[],
  rothConv: YearlyPercentiles[],
): Row[] {
  return withdrawals.map((w, i) => {
    const r = rmd[i]?.p50 ?? 0;
    const c = rothConv[i]?.p50 ?? 0;
    return {
      age: w.age,
      year: w.year,
      withdrawals: w.p50,
      rmd: r,
      rothConversion: c,
      netWithdrawals: w.p50 + r,
    };
  });
}

interface Props {
  withdrawals: YearlyPercentiles[];
  rmd: YearlyPercentiles[];
  rothConversion: YearlyPercentiles[];
  density: Density;
  retirementAge: number;
}

export function WithdrawalScheduleTable({ withdrawals, rmd, rothConversion, density, retirementAge }: Props) {
  const rows = buildRows(withdrawals, rmd, rothConversion);
  const { data, getSortProps } = useSortableTable(rows, { key: "age", direction: "asc" });
  const fmt = (v: number) => formatCurrency(v, { compact: true });

  const handleExport = useCallback(() => {
    const headers = [
      "Age",
      "Year",
      "Withdrawals (median)",
      "RMD (median)",
      "Roth Conversion (median)",
      "Total",
    ];
    const csvRows = rows.map((r) => [
      r.age,
      r.year,
      Math.round(r.withdrawals),
      Math.round(r.rmd),
      Math.round(r.rothConversion),
      Math.round(r.netWithdrawals),
    ]);
    downloadCsv(toCsv(headers, csvRows), "withdrawal-schedule.csv");
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
              <TableHeaderCell {...getSortProps("withdrawals")} numeric>
                Withdrawals
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("rmd")} numeric>
                RMD
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("rothConversion")} numeric>
                Roth Conversion
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("netWithdrawals")} numeric>
                Total Drawdown
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
                <TableCell numeric>{fmt(r.withdrawals)}</TableCell>
                <TableCell numeric>{fmt(r.rmd)}</TableCell>
                <TableCell numeric>{fmt(r.rothConversion)}</TableCell>
                <TableCell numeric className="font-medium">
                  {fmt(r.netWithdrawals)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
