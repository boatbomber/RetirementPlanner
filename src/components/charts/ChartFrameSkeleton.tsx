import type { ReactNode } from "react";
import { ParentSize } from "@visx/responsive";
import { Skeleton } from "@/components/primitives/Progress/Skeleton";

interface ChartFrameSkeletonProps {
  /**
   * Chart inner height as a function of available width. Must match the
   * formula the real chart uses so the placeholder lands at the exact
   * height it will swap into. When width is 0 (initial measure) the
   * function naturally returns the formula's lower clamp.
   */
  height: (width: number) => number;
  /** Hide the toggle-button placeholder row. Default false (most charts have a data table toggle). */
  hideToggle?: boolean;
  /** Footer slot below the chart skeleton (e.g. legend strip placeholder). */
  footer?: ReactNode;
}

/**
 * Loading-state placeholder shaped like a `framing="bare"` ChartFrame body:
 * toggle-button row, 8px gap, chart-area skeleton at the same height the
 * real chart will render at, and an optional footer.
 */
export function ChartFrameSkeleton({ height, hideToggle = false, footer }: ChartFrameSkeletonProps) {
  return (
    <div className="flex flex-col gap-[var(--space-3)]">
      {!hideToggle && (
        <div className="flex justify-end">
          <Skeleton width={92} height={28} />
        </div>
      )}
      <ParentSize debounceTime={0}>{({ width }) => <Skeleton height={height(width)} />}</ParentSize>
      {footer}
    </div>
  );
}
