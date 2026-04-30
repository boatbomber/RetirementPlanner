import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  TableFooterRow,
  useSortableTable,
} from "@/components/primitives";
import { formatCurrency } from "@/lib/format";

interface YearData {
  year: number;
  age: number;
  income: number;
  spending: number;
  savings: number;
  portfolio: number;
}

const sampleData: YearData[] = [
  {
    year: 2026,
    age: 40,
    income: 180000,
    spending: 72000,
    savings: 36000,
    portfolio: 820000,
  },
  {
    year: 2027,
    age: 41,
    income: 185400,
    spending: 73800,
    savings: 37080,
    portfolio: 912000,
  },
  {
    year: 2028,
    age: 42,
    income: 190962,
    spending: 75645,
    savings: 38192,
    portfolio: 1010000,
  },
  {
    year: 2029,
    age: 43,
    income: 196591,
    spending: 77536,
    savings: 39318,
    portfolio: 1115000,
  },
  {
    year: 2030,
    age: 44,
    income: 202288,
    spending: 79475,
    savings: 40458,
    portfolio: 1228000,
  },
];

export function TableSection() {
  const { data, getSortProps } = useSortableTable(sampleData, {
    key: "year",
    direction: "asc",
  });

  return (
    <section className="flex flex-col gap-[var(--space-7)]">
      <div>
        <h2 className="text-metric-lg font-semibold tracking-tight text-text-primary">Table</h2>
        <p className="mt-1 text-body text-text-secondary">
          Sortable, sticky header, tabular numerals, totals row. Click headers to sort.
        </p>
      </div>

      <div className="overflow-hidden rounded-md border border-[var(--color-border-subtle)]">
        <Table density="comfortable">
          <TableHeader>
            <tr>
              <TableHeaderCell {...getSortProps("year")}>Year</TableHeaderCell>
              <TableHeaderCell {...getSortProps("age")} numeric>
                Age
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("income")} numeric>
                Income
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("spending")} numeric>
                Spending
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("savings")} numeric>
                Savings
              </TableHeaderCell>
              <TableHeaderCell {...getSortProps("portfolio")} numeric>
                Portfolio
              </TableHeaderCell>
            </tr>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.year}>
                <TableCell>{row.year}</TableCell>
                <TableCell numeric>{row.age}</TableCell>
                <TableCell numeric>{formatCurrency(row.income)}</TableCell>
                <TableCell numeric>{formatCurrency(row.spending)}</TableCell>
                <TableCell numeric>{formatCurrency(row.savings)}</TableCell>
                <TableCell numeric>{formatCurrency(row.portfolio)}</TableCell>
              </TableRow>
            ))}
            <TableFooterRow>
              <TableCell>Total</TableCell>
              <TableCell />
              <TableCell numeric>{formatCurrency(sampleData.reduce((s, r) => s + r.income, 0))}</TableCell>
              <TableCell numeric>{formatCurrency(sampleData.reduce((s, r) => s + r.spending, 0))}</TableCell>
              <TableCell numeric>{formatCurrency(sampleData.reduce((s, r) => s + r.savings, 0))}</TableCell>
              <TableCell numeric>{formatCurrency(sampleData[sampleData.length - 1].portfolio)}</TableCell>
            </TableFooterRow>
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
