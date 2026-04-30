import { useMemo } from "react";
import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import { AreaClosed, LinePath } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { curveMonotoneX } from "@visx/curve";
import { ParentSize } from "@visx/responsive";
import type { WealthPathPoint } from "@/models/goal";
import type { Age } from "@/models/core";
import { formatCurrency } from "@/lib/format";

export interface MiniWealthChartProps {
  // Primary path: rendered as p10–p90 band + p50 line.
  primary: WealthPathPoint[];
  // Optional overlay series: rendered as a single line above the primary.
  // When present, the legend entries appear in the chart corner.
  overlay?: WealthPathPoint[];
  // Vertical dashed marker at this age (e.g., the retirement age).
  markerAge?: Age;
  markerLabel?: string;
  // Legend labels, only rendered when `overlay` is also set.
  primaryLabel?: string;
  overlayLabel?: string;
  // Minimum height. The chart fills its flex parent; this floor prevents it
  // from collapsing when the container has no height of its own.
  minHeight?: number;
}

const MARGIN = { top: 8, right: 12, bottom: 24, left: 48 };

function MiniWealthChartInner({
  primary,
  overlay,
  markerAge,
  markerLabel,
  width,
  height,
}: Omit<MiniWealthChartProps, "primaryLabel" | "overlayLabel"> & { width: number; height: number }) {
  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;

  const minAge = primary[0]?.age ?? 0;
  const maxAge = primary[primary.length - 1]?.age ?? 100;

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [minAge, maxAge],
        range: [0, innerWidth],
      }),
    [minAge, maxAge, innerWidth],
  );

  // Clip overlay to the primary's age range so it never extends past the
  // chart's x-axis. The actual simulation may run further than the solver's
  // wealthPath (different terminal ages), and unfiltered points draw outside
  // the plot area.
  const clippedOverlay = useMemo(
    () => overlay?.filter((d) => d.age >= minAge && d.age <= maxAge),
    [overlay, minAge, maxAge],
  );

  const yScale = useMemo(() => {
    let max = 0;
    for (const d of primary) if (d.p90 > max) max = d.p90;
    if (clippedOverlay) for (const d of clippedOverlay) if (d.p50 > max) max = d.p50;
    return scaleLinear<number>({
      domain: [0, max * 1.05],
      range: [innerHeight, 0],
      nice: true,
    });
  }, [primary, clippedOverlay, innerHeight]);

  if (primary.length === 0 || innerWidth <= 0 || innerHeight <= 0) return null;

  const markerX = markerAge != null ? xScale(markerAge) : undefined;

  const last = primary[primary.length - 1];
  const ariaLabel = `Wealth projection sparkline from age ${primary[0].age} to ${last.age}. Median terminal balance ${formatCurrency(last.p50, { compact: true })}, 10th–90th percentile range ${formatCurrency(last.p10, { compact: true })} to ${formatCurrency(last.p90, { compact: true })}.`;

  return (
    <svg width={width} height={height} role="img" aria-label={ariaLabel}>
      <Group left={MARGIN.left} top={MARGIN.top}>
        <AreaClosed
          data={primary}
          x={(d) => xScale(d.age)}
          y0={(d) => yScale(d.p10)}
          y1={(d) => yScale(d.p90)}
          yScale={yScale}
          curve={curveMonotoneX}
          fill="var(--viz-band-inner)"
          strokeWidth={0}
        />
        <LinePath
          data={primary}
          x={(d) => xScale(d.age)}
          y={(d) => yScale(d.p50)}
          curve={curveMonotoneX}
          stroke="var(--viz-band-median)"
          strokeWidth={1.75}
        />

        {clippedOverlay && clippedOverlay.length > 0 && (
          <LinePath
            data={clippedOverlay}
            x={(d) => xScale(d.age)}
            y={(d) => yScale(d.p50)}
            curve={curveMonotoneX}
            stroke="var(--color-success)"
            strokeWidth={1.75}
            strokeDasharray="4 3"
          />
        )}

        <line
          x1={0}
          y1={yScale(0)}
          x2={innerWidth}
          y2={yScale(0)}
          stroke="var(--color-marker-reference)"
          strokeWidth={1}
        />

        {markerX != null && markerX >= 0 && markerX <= innerWidth && (
          <>
            <line
              x1={markerX}
              y1={0}
              x2={markerX}
              y2={innerHeight}
              stroke="var(--color-marker-goal)"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            {markerLabel && (
              <text
                x={markerX + 4}
                y={10}
                fontSize={10}
                fontFamily="var(--font-sans)"
                fill="var(--color-marker-goal)"
              >
                {markerLabel}
              </text>
            )}
          </>
        )}

        <AxisBottom
          top={innerHeight}
          scale={xScale}
          numTicks={Math.min(primary.length, Math.floor(innerWidth / 50))}
          tickFormat={(v) => `${v}`}
          stroke="var(--color-marker-reference)"
          tickStroke="var(--color-marker-reference)"
          tickLabelProps={{
            fill: "var(--color-text-tertiary)",
            fontSize: 10,
            fontFamily: "var(--font-sans)",
            textAnchor: "middle",
          }}
        />
        <AxisLeft
          scale={yScale}
          numTicks={4}
          tickFormat={(v) => formatCurrency(v as number, { compact: true })}
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
  );
}

export function MiniWealthChart(props: MiniWealthChartProps) {
  const minHeight = props.minHeight ?? 160;
  const showLegend = !!props.overlay;

  return (
    <div className="flex h-full min-h-0 flex-col gap-[var(--space-2)]">
      <div className="min-h-0 flex-1" style={{ minHeight }}>
        <ParentSize debounceTime={0}>
          {({ width, height }) =>
            width > 0 && height > 0 ? (
              <MiniWealthChartInner
                primary={props.primary}
                overlay={props.overlay}
                markerAge={props.markerAge}
                markerLabel={props.markerLabel}
                width={width}
                height={height}
              />
            ) : null
          }
        </ParentSize>
      </div>

      {showLegend && (
        <div className="flex items-center justify-end gap-[var(--space-4)] text-overline text-text-secondary">
          <span className="flex items-center gap-[var(--space-2)]">
            <svg width={20} height={6} aria-hidden>
              <line x1={0} x2={20} y1={3} y2={3} stroke="var(--viz-band-median)" strokeWidth={1.75} />
            </svg>
            {props.primaryLabel ?? "Minimum"}
          </span>
          <span className="flex items-center gap-[var(--space-2)]">
            <svg width={20} height={6} aria-hidden>
              <line
                x1={0}
                x2={20}
                y1={3}
                y2={3}
                stroke="var(--color-success)"
                strokeWidth={1.75}
                strokeDasharray="4 3"
              />
            </svg>
            {props.overlayLabel ?? "Actual"}
          </span>
        </div>
      )}
    </div>
  );
}
