export interface CsvMetadata {
  scenarioName?: string;
  exportedAt?: string;
  notes?: string[];
}

// Spreadsheet apps treat any cell starting with =, +, -, or @ as a formula
// (Excel/Sheets/LibreOffice). User-controlled scenario names like
// `=HYPERLINK("...", "click")` would execute on import. Defuse by prefixing
// a single quote, the standard mitigation per OWASP "CSV Injection".
const FORMULA_PREFIXES = new Set(["=", "+", "-", "@"]);
function defuseFormula(s: string): string {
  return s.length > 0 && FORMULA_PREFIXES.has(s[0]) ? `'${s}` : s;
}

export function toCsv(headers: string[], rows: (string | number)[][], metadata?: CsvMetadata): string {
  const escape = (v: string | number) => {
    const s = defuseFormula(String(v));
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  if (metadata) {
    // Even though comment lines start with `#`, some configurations don't
    // skip them - the scenario name still flows through escape() to defuse
    // any embedded formula triggers and to handle commas/newlines.
    if (metadata.scenarioName) lines.push(`# Scenario: ${escape(metadata.scenarioName)}`);
    lines.push(`# Exported: ${metadata.exportedAt ?? new Date().toISOString()}`);
    if (metadata.notes) {
      for (const note of metadata.notes) lines.push(`# ${escape(note)}`);
    }
  }
  lines.push(headers.map(escape).join(","));
  for (const row of rows) {
    lines.push(row.map(escape).join(","));
  }
  return lines.join("\n");
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
