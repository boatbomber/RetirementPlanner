import { useMemo } from "react";
import type { LifeEvent } from "@/models/life-event";
import { ChartMarker } from "./ChartMarker";
import { EVENT_COLORS, getEventIcon, LifeEventTooltipContent } from "./lifeEventStyles";

export interface LifeEventMarkersProps {
  events: LifeEvent[];
  xScale: (age: number) => number;
  innerWidth: number;
  innerHeight: number;
  marginLeft: number;
  marginTop: number;
}

export function LifeEventMarkers({
  events,
  xScale,
  innerWidth,
  innerHeight,
  marginLeft,
  marginTop,
}: LifeEventMarkersProps) {
  const visible = useMemo(() => {
    return events
      .map((e) => ({ event: e, x: xScale(e.triggerAge), color: EVENT_COLORS[e.type] }))
      .filter((m) => m.x >= 0 && m.x <= innerWidth);
  }, [events, xScale, innerWidth]);

  if (visible.length === 0) return null;

  return (
    <>
      {visible.map(({ event, x, color }) => (
        <ChartMarker
          key={event.id}
          x={x}
          innerHeight={innerHeight}
          marginLeft={marginLeft}
          marginTop={marginTop}
          color={color}
          icon={getEventIcon(event)}
          tooltip={<LifeEventTooltipContent event={event} />}
        />
      ))}
    </>
  );
}
