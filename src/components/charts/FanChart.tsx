import { memo, useCallback, useMemo, useRef, useState } from "react";
import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import { AreaClosed, LinePath } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { curveMonotoneX } from "@visx/curve";
import { localPoint } from "@visx/event";
import { ParentSize } from "@visx/responsive";
import { RockingChair } from "lucide-react";
import type { YearlyPercentiles } from "@/models/results";
import type { Age } from "@/models/core";
import type { LifeEvent } from "@/models/life-event";
import { formatCurrency, formatRange } from "@/lib/format";
import { ChartFrame } from "./ChartFrame";
import { LifeEventMarkers } from "./LifeEventMarkers";
import { ChartMarker } from "./ChartMarker";
import { RetirementTooltipContent } from "./lifeEventStyles";

export interface FanChartProps {
  data: YearlyPercentiles[];
  retirementAge?: Age;
  currentAge?: Age;
  /** Life events to render as vertical markers along the age axis. */
  events?: LifeEvent[];
  /** Optional override; defaults to "Projected portfolio balance". */
  title?: string;
  /** Assumption provenance line (CMA / mortality / inflation / iterations). */
  subCaption?: string;
  /** "framed" (default): full ChartFrame header. "bare": skip header but keep aria-region + table toggle. */
  framing?: "framed" | "bare";
  className?: string;
}

const MARGIN = { top: 32, right: 24, bottom: 48, left: 72 };

interface TooltipState {
  datum: YearlyPercentiles;
  svgX: number;
  clientX: number;
  clientY: number;
}

function FanChartInner({
  data,
  retirementAge,
  currentAge,
  events,
  width,
  height,
}: FanChartProps & { width: number; height: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [data[0]?.age ?? 0, data[data.length - 1]?.age ?? 100],
        range: [0, innerWidth],
      }),
    [data, innerWidth],
  );

  const yMax = useMemo(() => {
    let max = 0;
    for (const d of data) {
      if (d.p95 > max) max = d.p95;
    }
    return max * 1.05;
  }, [data]);

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, yMax],
        range: [innerHeight, 0],
        nice: true,
      }),
    [yMax, innerHeight],
  );

  // Outermost (p5-p95) is least opaque, p10/p90 is the "middle" ring, and
  // p25/p75 (innermost) is the most opaque. Bands are drawn back-to-front,
  // so painting outer first then middle then inner means each ring sits
  // on top of the previous one and opacity stacks correctly.
  const bands: Array<{
    upper: (d: YearlyPercentiles) => number;
    lower: (d: YearlyPercentiles) => number;
    color: string;
  }> = [
    { upper: (d) => d.p95, lower: (d) => d.p5, color: "var(--viz-band-outer)" },
    { upper: (d) => d.p90, lower: (d) => d.p10, color: "var(--viz-band-middle)" },
    { upper: (d) => d.p75, lower: (d) => d.p25, color: "var(--viz-band-inner)" },
  ];

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGRectElement>) => {
      const point = localPoint(svgRef.current!, event);
      if (!point) return;
      const x = point.x - MARGIN.left;
      const age = xScale.invert(x);
      let closest = data[0];
      let minDist = Infinity;
      for (const d of data) {
        const dist = Math.abs(d.age - age);
        if (dist < minDist) {
          minDist = dist;
          closest = d;
        }
      }
      setTooltip({
        datum: closest,
        svgX: xScale(closest.age),
        clientX: event.clientX,
        clientY: event.clientY,
      });
    },
    [data, xScale],
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  if (data.length === 0 || innerWidth <= 0 || innerHeight <= 0) return null;

  const retirementX = retirementAge != null ? xScale(retirementAge) : undefined;
  const currentX = currentAge != null ? xScale(currentAge) : undefined;

  return (
    <div className="relative">
      <svg ref={svgRef} width={width} height={height}>
        <Group left={MARGIN.left} top={MARGIN.top}>
          {bands.map((band, i) => (
            <AreaClosed
              key={i}
              data={data}
              x={(d) => xScale(d.age)}
              y0={(d) => yScale(band.lower(d))}
              y1={(d) => yScale(band.upper(d))}
              yScale={yScale}
              curve={curveMonotoneX}
              fill={band.color}
              strokeWidth={0}
            />
          ))}

          <LinePath
            data={data}
            x={(d) => xScale(d.age)}
            y={(d) => yScale(d.p50)}
            curve={curveMonotoneX}
            stroke="var(--viz-band-median)"
            strokeWidth={2}
          />

          {/* $0 reference line; anchors the eye when the median dips low. */}
          <line
            x1={0}
            y1={yScale(0)}
            x2={innerWidth}
            y2={yScale(0)}
            stroke="var(--color-marker-reference)"
            strokeWidth={1}
          />

          {currentX != null && currentX >= 0 && currentX <= innerWidth && (
            <>
              <line
                x1={currentX}
                y1={0}
                x2={currentX}
                y2={innerHeight}
                stroke="var(--color-marker-today)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={currentX + 4}
                y={12}
                fontSize={11}
                fontFamily="var(--font-sans)"
                fill="var(--color-marker-today)"
              >
                Today
              </text>
            </>
          )}

          {tooltip && (
            <line
              x1={tooltip.svgX}
              y1={0}
              x2={tooltip.svgX}
              y2={innerHeight}
              stroke="var(--color-marker-crosshair)"
              strokeWidth={1}
              pointerEvents="none"
            />
          )}

          <AxisBottom
            top={innerHeight}
            scale={xScale}
            numTicks={Math.min(data.length, Math.floor(innerWidth / 60))}
            tickFormat={(v) => `${v}`}
            stroke="var(--color-marker-reference)"
            tickStroke="var(--color-marker-reference)"
            tickLabelProps={{
              fill: "var(--color-text-tertiary)",
              fontSize: 11,
              fontFamily: "var(--font-sans)",
              textAnchor: "middle",
            }}
            label="Age"
            labelProps={{
              fill: "var(--color-text-secondary)",
              fontSize: 12,
              fontFamily: "var(--font-sans)",
              textAnchor: "middle",
            }}
          />

          <AxisLeft
            scale={yScale}
            numTicks={5}
            tickFormat={(v) => formatCurrency(v as number, { compact: true })}
            stroke="var(--color-marker-reference)"
            tickStroke="var(--color-marker-reference)"
            tickLabelProps={{
              fill: "var(--color-text-tertiary)",
              fontSize: 11,
              fontFamily: "var(--font-sans)",
              textAnchor: "end",
              dx: "-0.4em",
              dy: "0.3em",
            }}
          />

          <rect
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          />
        </Group>
      </svg>

      {events && events.length > 0 && (
        <LifeEventMarkers
          events={events}
          xScale={xScale}
          innerWidth={innerWidth}
          innerHeight={innerHeight}
          marginLeft={MARGIN.left}
          marginTop={MARGIN.top}
        />
      )}
      {retirementX != null && retirementX >= 0 && retirementX <= innerWidth && (
        <ChartMarker
          x={retirementX}
          innerHeight={innerHeight}
          marginLeft={MARGIN.left}
          marginTop={MARGIN.top}
          color="var(--color-marker-goal)"
          icon={<RockingChair size={16} />}
          tooltip={<RetirementTooltipContent age={retirementAge!} />}
          prominent
        />
      )}

      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 max-w-[280px] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-3 py-2 shadow-[var(--shadow-3)]"
          style={{
            // Clamp to the viewport so the tooltip never bleeds off the
            // right/bottom edge on narrow screens or when the cursor is near
            // the page edge. The 280/120 estimates match max-width/typical
            // height; over-estimating just keeps the tooltip a bit further in.
            left: Math.min(tooltip.clientX + 12, window.innerWidth - 290),
            top: Math.max(8, Math.min(tooltip.clientY - 12, window.innerHeight - 130)),
          }}
        >
          <FanChartTooltip datum={tooltip.datum} />
        </div>
      )}
    </div>
  );
}

function FanChartTooltip({ datum }: { datum: YearlyPercentiles }) {
  const rows = [
    { label: "5th–95th", value: formatRange(datum.p5, datum.p95) },
    { label: "10th–90th", value: formatRange(datum.p10, datum.p90) },
    { label: "25th–75th", value: formatRange(datum.p25, datum.p75) },
    { label: "Median", value: formatCurrency(datum.p50, { compact: true }) },
  ];

  return (
    <div className="text-overline leading-relaxed">
      <div className="mb-1 font-semibold text-text-primary">Age {datum.age}</div>
      <table className="tabular-nums">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="pr-3 text-text-tertiary">{r.label}</td>
              <td className="text-right text-text-primary">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FanChartTable({ data }: { data: YearlyPercentiles[] }) {
  return (
    <div className="max-h-80 overflow-auto scroll-shadow-x">
      <table className="w-full text-caption tabular-nums">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-[var(--color-border-subtle)]">
            <th className="px-2 py-1 text-left text-text-tertiary font-medium">Age</th>
            <th className="px-2 py-1 text-right text-text-tertiary font-medium">5th</th>
            <th className="px-2 py-1 text-right text-text-tertiary font-medium">10th</th>
            <th className="px-2 py-1 text-right text-text-tertiary font-medium">25th</th>
            <th className="px-2 py-1 text-right text-text-tertiary font-medium">Median</th>
            <th className="px-2 py-1 text-right text-text-tertiary font-medium">75th</th>
            <th className="px-2 py-1 text-right text-text-tertiary font-medium">90th</th>
            <th className="px-2 py-1 text-right text-text-tertiary font-medium">95th</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.age} className="border-b border-[var(--color-border-subtle)] last:border-b-0">
              <td className="px-2 py-1 text-text-primary">{d.age}</td>
              <td className="px-2 py-1 text-right text-text-secondary">
                {formatCurrency(d.p5, { compact: true })}
              </td>
              <td className="px-2 py-1 text-right text-text-secondary">
                {formatCurrency(d.p10, { compact: true })}
              </td>
              <td className="px-2 py-1 text-right text-text-secondary">
                {formatCurrency(d.p25, { compact: true })}
              </td>
              <td className="px-2 py-1 text-right text-text-primary font-medium">
                {formatCurrency(d.p50, { compact: true })}
              </td>
              <td className="px-2 py-1 text-right text-text-secondary">
                {formatCurrency(d.p75, { compact: true })}
              </td>
              <td className="px-2 py-1 text-right text-text-secondary">
                {formatCurrency(d.p90, { compact: true })}
              </td>
              <td className="px-2 py-1 text-right text-text-secondary">
                {formatCurrency(d.p95, { compact: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const FanChart = memo(function FanChart({
  data,
  retirementAge,
  currentAge,
  events,
  title = "Projected portfolio balance",
  subCaption,
  framing = "framed",
  className,
}: FanChartProps) {
  const ariaLabel = useMemo(() => {
    if (data.length === 0) return "Empty fan chart";
    const first = data[0];
    const last = data[data.length - 1];
    return `Fan chart of projected portfolio balance from age ${first.age} to ${last.age}. Median terminal balance ${formatCurrency(last.p50, { compact: true })}, 5th–95th percentile range ${formatCurrency(last.p5, { compact: true })} to ${formatCurrency(last.p95, { compact: true })}.`;
  }, [data]);

  return (
    <ChartFrame
      title={title}
      subCaption={subCaption}
      ariaLabel={ariaLabel}
      framing={framing}
      dataTable={<FanChartTable data={data} />}
      className={className}
    >
      <ParentSize debounceTime={0}>
        {({ width }) =>
          width > 0 ? (
            <FanChartInner
              data={data}
              retirementAge={retirementAge}
              currentAge={currentAge}
              events={events}
              width={width}
              height={Math.min(400, Math.max(280, width * 0.45))}
            />
          ) : null
        }
      </ParentSize>
    </ChartFrame>
  );
});
