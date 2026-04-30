import { memo, useMemo, useCallback, useRef, useState } from "react";
import { Group } from "@visx/group";
import { scaleLinear, scaleOrdinal } from "@visx/scale";
import { AreaStack } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { curveMonotoneX } from "@visx/curve";
import { localPoint } from "@visx/event";
import { ParentSize } from "@visx/responsive";
import { RockingChair } from "lucide-react";
import type { YearlyPercentiles } from "@/models/results";
import type { LifeEvent } from "@/models/life-event";
import { formatCurrency } from "@/lib/format";
import { ChartFrame } from "./ChartFrame";
import { LifeEventMarkers } from "./LifeEventMarkers";
import { ChartMarker } from "./ChartMarker";
import { RetirementTooltipContent } from "./lifeEventStyles";

export interface IncomeCompositionChartProps {
  income: YearlyPercentiles[];
  spending: YearlyPercentiles[];
  tax: YearlyPercentiles[];
  retirementAge?: number;
  /** Life events to render as vertical markers along the age axis. */
  events?: LifeEvent[];
  /** Optional override; defaults to "Income, spending, and taxes". */
  title?: string;
  /** Assumption provenance line. */
  subCaption?: string;
  /** "framed" (default): full ChartFrame header. "bare": skip header but keep aria-region + table toggle. */
  framing?: "framed" | "bare";
  className?: string;
}

interface StackDatum {
  age: number;
  income: number;
  spending: number;
  taxes: number;
}

const KEYS = ["spending", "taxes", "income"] as const;
const LABELS: Record<string, string> = {
  income: "Net Income",
  spending: "Spending",
  taxes: "Taxes",
};
const COLORS: Record<string, string> = {
  income: "var(--viz-1)",
  spending: "var(--viz-2)",
  taxes: "var(--viz-4)",
};

const MARGIN = { top: 32, right: 16, bottom: 48, left: 72 };

interface TooltipState {
  datum: StackDatum;
  clientX: number;
  clientY: number;
}

function ChartInner({
  income,
  spending,
  tax,
  retirementAge,
  events,
  width,
  height,
}: IncomeCompositionChartProps & { width: number; height: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;

  const data: StackDatum[] = useMemo(() => {
    return income.map((inc, i) => {
      const s = spending[i]?.p50 ?? 0;
      const t = tax[i]?.p50 ?? 0;
      const netIncome = Math.max(0, inc.p50 - s - t);
      return {
        age: inc.age,
        income: netIncome,
        spending: s,
        taxes: t,
      };
    });
  }, [income, spending, tax]);

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
      const total = d.income + d.spending + d.taxes;
      if (total > max) max = total;
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

  const colorScale = useMemo(
    () =>
      scaleOrdinal<string, string>({
        domain: [...KEYS],
        range: KEYS.map((k) => COLORS[k]),
      }),
    [],
  );

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
        clientX: event.clientX,
        clientY: event.clientY,
      });
    },
    [data, xScale],
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  if (data.length === 0 || innerWidth <= 0 || innerHeight <= 0) return null;

  const retirementX = retirementAge != null ? xScale(retirementAge) : undefined;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        role="img"
        aria-label="Stacked area chart of annual income, spending, and taxes by year"
      >
        <Group left={MARGIN.left} top={MARGIN.top}>
          <AreaStack
            data={data}
            keys={[...KEYS]}
            x={(d) => xScale(d.data.age)}
            y0={(d) => yScale(d[0])}
            y1={(d) => yScale(d[1])}
            curve={curveMonotoneX}
          >
            {({ stacks, path }) =>
              stacks.map((stack) => (
                <path key={stack.key} d={path(stack) || ""} fill={colorScale(stack.key)} opacity={0.7} />
              ))
            }
          </AreaStack>

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
            left: Math.min(tooltip.clientX + 12, window.innerWidth - 290),
            top: Math.max(8, Math.min(tooltip.clientY - 12, window.innerHeight - 130)),
          }}
        >
          <div className="text-overline leading-relaxed">
            <div className="mb-1 font-semibold text-text-primary">Age {tooltip.datum.age}</div>
            <table className="tabular-nums">
              <tbody>
                <tr>
                  <td className="pr-3 text-text-tertiary">Spending</td>
                  <td className="text-right text-text-primary">
                    {formatCurrency(tooltip.datum.spending, { compact: true })}
                  </td>
                </tr>
                <tr>
                  <td className="pr-3 text-text-tertiary">Taxes</td>
                  <td className="text-right text-text-primary">
                    {formatCurrency(tooltip.datum.taxes, { compact: true })}
                  </td>
                </tr>
                <tr>
                  <td className="pr-3 text-text-tertiary">Net Income</td>
                  <td className="text-right text-text-primary">
                    {formatCurrency(tooltip.datum.income, { compact: true })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CompositionTable({
  income,
  spending,
  tax,
}: Pick<IncomeCompositionChartProps, "income" | "spending" | "tax">) {
  const ages = income.map((d) => d.age);
  return (
    <div className="max-h-80 overflow-auto scroll-shadow-x">
      <table className="w-full text-caption tabular-nums">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-[var(--color-border-subtle)]">
            <th className="px-2 py-1 text-left text-text-tertiary font-medium">Age</th>
            <th className="px-2 py-1 text-right text-text-tertiary font-medium">Income (median)</th>
            <th className="px-2 py-1 text-right text-text-tertiary font-medium">Spending (median)</th>
            <th className="px-2 py-1 text-right text-text-tertiary font-medium">Taxes (median)</th>
          </tr>
        </thead>
        <tbody>
          {ages.map((age, i) => (
            <tr key={age} className="border-b border-[var(--color-border-subtle)] last:border-b-0">
              <td className="px-2 py-1 text-text-primary">{age}</td>
              <td className="px-2 py-1 text-right text-text-secondary">
                {formatCurrency(income[i]?.p50 ?? 0, { compact: true })}
              </td>
              <td className="px-2 py-1 text-right text-text-secondary">
                {formatCurrency(spending[i]?.p50 ?? 0, { compact: true })}
              </td>
              <td className="px-2 py-1 text-right text-text-secondary">
                {formatCurrency(tax[i]?.p50 ?? 0, { compact: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const IncomeCompositionChart = memo(function IncomeCompositionChart({
  income,
  spending,
  tax,
  retirementAge,
  events,
  title = "Income, spending, and taxes",
  subCaption,
  framing = "framed",
  className,
}: IncomeCompositionChartProps) {
  const ariaLabel = useMemo(() => {
    if (income.length === 0) return "Empty income composition chart";
    const last = income[income.length - 1];
    return `Stacked composition chart of net income, spending, and taxes from age ${income[0].age} to ${last.age}.`;
  }, [income]);

  return (
    <ChartFrame
      title={title}
      subCaption={subCaption}
      ariaLabel={ariaLabel}
      framing={framing}
      dataTable={<CompositionTable income={income} spending={spending} tax={tax} />}
      className={className}
    >
      <ParentSize debounceTime={0}>
        {({ width }) =>
          width > 0 ? (
            <ChartInner
              income={income}
              spending={spending}
              tax={tax}
              retirementAge={retirementAge}
              events={events}
              width={width}
              height={Math.min(320, Math.max(220, width * 0.38))}
            />
          ) : null
        }
      </ParentSize>
      <ul
        role="list"
        aria-label="Chart legend"
        className="flex items-center justify-center gap-[var(--space-4)] mt-[var(--space-1)]"
      >
        {KEYS.map((key) => (
          <li key={key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COLORS[key], opacity: 0.7 }}
            />
            <span className="text-caption text-text-tertiary">{LABELS[key]}</span>
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
});
