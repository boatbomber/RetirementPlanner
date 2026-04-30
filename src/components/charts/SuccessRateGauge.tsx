import { memo } from "react";
import { cn } from "@/lib/cn";

interface SuccessRateGaugeProps {
  value: number;
  size?: number;
  className?: string;
}

function getColor(value: number): string {
  if (value >= 0.8) return "var(--color-success)";
  if (value >= 0.6) return "var(--color-warning)";
  return "var(--color-danger)";
}

export const SuccessRateGauge = memo(function SuccessRateGauge({
  value,
  size = 48,
  className,
}: SuccessRateGaugeProps) {
  const strokeWidth = size * 0.15;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));
  const dashOffset = circumference * (1 - clamped);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0", className)}
      role="img"
      aria-label={`${Math.round(clamped * 100)}% success rate`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-surface-sunken)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={getColor(clamped)}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{
          transition: `stroke-dashoffset var(--motion-moderate) var(--ease-out)`,
        }}
      />
    </svg>
  );
});
