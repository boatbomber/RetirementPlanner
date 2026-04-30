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

interface Props {
  data: YearlyPercentiles[];
  density: Density;
  retirementAge: number;
  exportFilename: string;
}

export function PercentileTable({ data: rawData, density, retirementAge, exportFilename }: Props) {
  const { data, getSortProps } = useSortableTable(rawData, {
    key: "age",
    direction: "asc",
  });
  const fmt = (v: number) => formatCurrency(v, { compact: true });

  const handleExport = useCallback(() => {
    const headers = ["Age", "Year", "p5", "p10", "p25", "p50", "p75", "p90", "p95"];
    const csvRows = rawData.map((r) => [
      r.age,
      r.year,
      Math.round(r.p5),
      Math.round(r.p10),
      Math.round(r.p25),
      Math.round(r.p50),
      Math.round(r.p75),
      Math.round(r.p90),
      Math.round(r.p95),
    ]);
    downloadCsv(toCsv(headers, csvRows), exportFilename);
  }, [rawData, exportFilename]);

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
              <TableHeaderCell {...getSortProps("p5")} numeric>
                p5
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("p10")} numeric>
                p10
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("p25")} numeric>
                p25
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("p50")} numeric>
                p50
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("p75")} numeric>
                p75
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("p90")} numeric>
                p90
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("p95")} numeric>
                p95
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
                <TableCell numeric className="text-text-tertiary">
                  {fmt(r.p5)}
                </TableCell>
                <TableCell numeric>{fmt(r.p10)}</TableCell>
                <TableCell numeric>{fmt(r.p25)}</TableCell>
                <TableCell numeric className="font-medium">
                  {fmt(r.p50)}
                </TableCell>
                <TableCell numeric>{fmt(r.p75)}</TableCell>
                <TableCell numeric>{fmt(r.p90)}</TableCell>
                <TableCell numeric className="text-text-tertiary">
                  {fmt(r.p95)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
