import { memo, useMemo, useCallback, useRef, useState } from "react";
import { Group } from "@visx/group";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Bar } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { ParentSize } from "@visx/responsive";
import type { WealthBucket } from "@/models/results";
import { formatCurrency } from "@/lib/format";
import { ChartFrame } from "./ChartFrame";

export interface HistogramChartProps {
  data: WealthBucket[];
  totalIterations: number;
  /** Optional override; defaults to "Terminal wealth distribution". */
  title?: string;
  /** Assumption provenance line. */
  subCaption?: string;
  /** "framed" (default): full ChartFrame header. "bare": skip header but keep aria-region + table toggle. */
  framing?: "framed" | "bare";
  className?: string;
}

const MARGIN = { top: 16, right: 16, bottom: 48, left: 56 };

function bucketLabel(b: WealthBucket): string {
  if (b.max === Infinity) return `${formatCurrency(b.min, { compact: true })}+`;
  return `${formatCurrency(b.min, { compact: true })}`;
}

interface TooltipState {
  bucket: WealthBucket;
  pct: number;
  clientX: number;
  clientY: number;
}

function HistogramInner({
  data,
  totalIterations,
  width,
  height,
}: HistogramChartProps & { width: number; height: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;

  const nonEmpty = useMemo(() => data.filter((b) => b.count > 0), [data]);

  const xScale = useMemo(
    () =>
      scaleBand<string>({
        domain: nonEmpty.map(bucketLabel),
        range: [0, innerWidth],
        padding: 0.2,
      }),
    [nonEmpty, innerWidth],
  );

  // Sample tick values so labels don't collide on narrow viewports. Target one
  // tick per ~64px of axis width.
  const tickValues = useMemo(() => {
    const labels = nonEmpty.map(bucketLabel);
    if (labels.length === 0) return labels;
    const maxLabels = Math.max(2, Math.floor(innerWidth / 64));
    if (labels.length <= maxLabels) return labels;
    const step = Math.ceil(labels.length / maxLabels);
    return labels.filter((_, i) => i % step === 0);
  }, [nonEmpty, innerWidth]);

  const yMax = useMemo(() => {
    const max = Math.max(...nonEmpty.map((b) => b.count));
    return max * 1.1;
  }, [nonEmpty]);

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, yMax],
        range: [innerHeight, 0],
        nice: true,
      }),
    [yMax, innerHeight],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGRectElement>, bucket: WealthBucket) => {
      setTooltip({
        bucket,
        pct: totalIterations > 0 ? bucket.count / totalIterations : 0,
        clientX: event.clientX,
        clientY: event.clientY,
      });
    },
    [totalIterations],
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  if (nonEmpty.length === 0 || innerWidth <= 0 || innerHeight <= 0) return null;

  return (
    <div className="relative">
      <svg ref={svgRef} width={width} height={height}>
        <Group left={MARGIN.left} top={MARGIN.top}>
          {nonEmpty.map((bucket) => {
            const label = bucketLabel(bucket);
            const barX = xScale(label) ?? 0;
            const barWidth = xScale.bandwidth();
            const barHeight = innerHeight - yScale(bucket.count);
            const barY = yScale(bucket.count);

            return (
              <Bar
                key={label}
                x={barX}
                y={barY}
                width={barWidth}
                height={barHeight}
                fill="var(--viz-1)"
                opacity={tooltip?.bucket === bucket ? 0.9 : 0.7}
                rx={2}
                onMouseMove={(e) => handleMouseMove(e as unknown as React.MouseEvent<SVGRectElement>, bucket)}
                onMouseLeave={handleMouseLeave}
                style={{ cursor: "default" }}
              />
            );
          })}

          <AxisBottom
            top={innerHeight}
            scale={xScale}
            tickValues={tickValues}
            stroke="var(--color-marker-reference)"
            tickStroke="var(--color-marker-reference)"
            tickLabelProps={{
              fill: "var(--color-text-tertiary)",
              fontSize: 10,
              fontFamily: "var(--font-sans)",
              textAnchor: "middle",
            }}
            label="Terminal Wealth"
            labelProps={{
              fill: "var(--color-text-secondary)",
              fontSize: 12,
              fontFamily: "var(--font-sans)",
              textAnchor: "middle",
            }}
          />

          <AxisLeft
            scale={yScale}
            numTicks={4}
            stroke="var(--color-marker-reference)"
            tickStroke="var(--color-marker-reference)"
            tickLabelProps={{
              fill: "var(--color-text-tertiary)",
              fontSize: 10,
              fontFamily: "var(--font-sans)",
              textAnchor: "end",
              dx: "-0.4em",
              dy: "0.3em",
            }}
          />
        </Group>
      </svg>

      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 max-w-[280px] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-3 py-2 shadow-[var(--shadow-3)]"
          style={{
            left: Math.min(tooltip.clientX + 12, window.innerWidth - 290),
            top: Math.max(8, Math.min(tooltip.clientY - 12, window.innerHeight - 130)),
          }}
        >
          <div className="text-overline leading-relaxed">
            <div className="font-semibold text-text-primary">
              {tooltip.bucket.max === Infinity
                ? `${formatCurrency(tooltip.bucket.min, { compact: true })}+`
                : `${formatCurrency(tooltip.bucket.min, { compact: true })} – ${formatCurrency(tooltip.bucket.max, { compact: true })}`}
            </div>
            <div className="text-text-secondary">
              {tooltip.bucket.count.toLocaleString()} iterations ({Math.round(tooltip.pct * 100)}%)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HistogramTable({ data, totalIterations }: { data: WealthBucket[]; totalIterations: number }) {
  return (
    <div className="max-h-80 overflow-auto scroll-shadow-x">
      <table className="w-full text-caption tabular-nums">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-[var(--color-border-subtle)]">
            <th className="px-2 py-1 text-left text-text-tertiary font-medium">Bucket</th>
            <th className="px-2 py-1 text-right text-text-tertiary font-medium">Iterations</th>
            <th className="px-2 py-1 text-right text-text-tertiary font-medium">% of paths</th>
          </tr>
        </thead>
        <tbody>
          {data.map((b) => {
            const pct = totalIterations > 0 ? b.count / totalIterations : 0;
            const label =
              b.max === Infinity
                ? `${formatCurrency(b.min, { compact: true })}+`
                : `${formatCurrency(b.min, { compact: true })} – ${formatCurrency(b.max, { compact: true })}`;
            return (
              <tr
                key={`${b.min}-${b.max}`}
                className="border-b border-[var(--color-border-subtle)] last:border-b-0"
              >
                <td className="px-2 py-1 text-text-primary">{label}</td>
                <td className="px-2 py-1 text-right text-text-secondary">{b.count.toLocaleString()}</td>
                <td className="px-2 py-1 text-right text-text-secondary">{(pct * 100).toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const HistogramChart = memo(function HistogramChart({
  data,
  totalIterations,
  title = "Terminal wealth distribution",
  subCaption,
  framing = "framed",
  className,
}: HistogramChartProps) {
  const ariaLabel = useMemo(() => {
    if (data.length === 0) return "Empty terminal wealth histogram";
    const peak = data.reduce((max, b) => (b.count > max.count ? b : max), data[0]);
    const peakLabel =
      peak.max === Infinity
        ? `${formatCurrency(peak.min, { compact: true })}+`
        : `${formatCurrency(peak.min, { compact: true })} to ${formatCurrency(peak.max, { compact: true })}`;
    return `Histogram of terminal wealth across ${totalIterations.toLocaleString()} iterations. Most frequent bucket: ${peakLabel}.`;
  }, [data, totalIterations]);

  return (
    <ChartFrame
      title={title}
      subCaption={subCaption}
      ariaLabel={ariaLabel}
      framing={framing}
      dataTable={<HistogramTable data={data} totalIterations={totalIterations} />}
      className={className}
    >
      <ParentSize debounceTime={0}>
        {({ width }) =>
          width > 0 ? (
            <HistogramInner
              data={data}
              totalIterations={totalIterations}
              width={width}
              height={Math.min(300, Math.max(200, width * 0.35))}
            />
          ) : null
        }
      </ParentSize>
    </ChartFrame>
  );
});
