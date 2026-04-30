const compactFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

const wholeFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const centsFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number, opts: { compact?: boolean; decimals?: 0 | 2 } = {}): string {
  if (opts.compact) return compactFormatter.format(value);
  if (opts.decimals === 2) return centsFormatter.format(value);
  return wholeFormatter.format(value);
}

const pctFormatters = new Map<number, Intl.NumberFormat>();
function getPctFormatter(decimals: number) {
  let f = pctFormatters.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      style: "percent",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    pctFormatters.set(decimals, f);
  }
  return f;
}

export function formatPercent(value: number, decimals = 1): string {
  return getPctFormatter(decimals).format(value);
}

export function formatPercent5pp(value: number): string {
  const rounded = Math.round(value * 20) * 5;
  return `${rounded}%`;
}

export function formatRange(
  min: number,
  max: number,
  formatter: (v: number) => string = (v) => formatCurrency(v, { compact: true }),
): string {
  return `${formatter(min)}–${formatter(max)}`;
}
