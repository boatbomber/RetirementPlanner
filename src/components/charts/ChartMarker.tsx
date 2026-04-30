import type { ReactNode } from "react";
import { Tooltip } from "@/components/primitives";

export interface ChartMarkerProps {
  /** X position within the inner chart area (0..innerWidth). */
  x: number;
  innerHeight: number;
  marginLeft: number;
  marginTop: number;
  color: string;
  icon: ReactNode;
  tooltip: ReactNode;
  /** Render with thicker line and slightly larger icon for high-priority markers (e.g., retirement). */
  prominent?: boolean;
}

const CIRCLE_DEFAULT = 24;
const CIRCLE_PROMINENT = 28;
const HIT_WIDTH = 28;

export function ChartMarker({
  x,
  innerHeight,
  marginLeft,
  marginTop,
  color,
  icon,
  tooltip,
  prominent = false,
}: ChartMarkerProps) {
  const circle = prominent ? CIRCLE_PROMINENT : CIRCLE_DEFAULT;
  const lineWidth = prominent ? 2 : 1;
  const lineOpacity = prominent ? 0.95 : 0.55;
  const lineDash = prominent ? "6 3" : "2 3";

  return (
    <Tooltip content={tooltip}>
      <div
        className="absolute cursor-default pointer-events-auto"
        style={{
          left: marginLeft + x - HIT_WIDTH / 2,
          top: marginTop - circle,
          width: HIT_WIDTH,
          height: circle + innerHeight,
        }}
      >
        <svg
          className="absolute pointer-events-none"
          style={{
            left: HIT_WIDTH / 2 - 2,
            top: circle,
            width: 4,
            height: innerHeight,
            overflow: "visible",
          }}
          aria-hidden
        >
          <line
            x1={2}
            y1={0}
            x2={2}
            y2={innerHeight}
            stroke={color}
            strokeWidth={lineWidth}
            strokeDasharray={lineDash}
            opacity={lineOpacity}
          />
        </svg>
        <div
          className="absolute flex items-center justify-center rounded-full pointer-events-none"
          style={{
            left: HIT_WIDTH / 2 - circle / 2,
            top: 0,
            width: circle,
            height: circle,
            backgroundColor: "var(--color-surface)",
            border: `${prominent ? 2 : 1.5}px solid ${color}`,
            color,
            boxShadow: prominent ? "var(--shadow-1)" : undefined,
          }}
          aria-hidden
        >
          {icon}
        </div>
      </div>
    </Tooltip>
  );
}
