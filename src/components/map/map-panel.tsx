"use client";

import { Info, MapPinned, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { getTileConfig } from "@/lib/services/tiles";
import type { EditablePin, MapPin, MapRoute } from "./types";

// Leaflet touches `window`, so it only ever loads in the browser.
const MapCanvas = dynamic(() => import("./map-canvas"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
});

type MapPanelProps = {
  pins: MapPin[];
  routes?: MapRoute[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  title?: string;
  /** Legend shown under the header, e.g. load colours or date colours. */
  legend?: React.ReactNode;
  onClose?: () => void;
  /** Shown over the map when there is nothing to plot (10.6). */
  emptyMessage?: string;
  /** A draggable pin for correcting a location. */
  editable?: EditablePin | null;
  className?: string;
};

/**
 * Map of orders and loads (9.2). Selecting a pin highlights the matching
 * card and vice versa via `selectedId` / `onSelect`.
 */
export function MapPanel({
  pins,
  routes = [],
  selectedId,
  onSelect,
  title = "Map",
  legend,
  onClose,
  emptyMessage = "Nothing to show on the map yet.",
  editable,
  className,
}: MapPanelProps) {
  const { resolvedTheme } = useTheme();
  const tiles = getTileConfig(resolvedTheme);

  return (
    <section
      aria-label={title}
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface",
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
        <h2 className="truncate text-sm font-semibold">{title}</h2>
        {onClose ? (
          <Button variant="ghost" size="sm" iconOnly aria-label="Hide map" onClick={onClose}>
            <X aria-hidden />
          </Button>
        ) : null}
      </header>
      {legend ? <div className="shrink-0 border-b border-border px-4 py-2">{legend}</div> : null}
      <div className="relative min-h-0 flex-1">
        <MapCanvas
          key={resolvedTheme}
          pins={pins}
          routes={routes}
          tiles={tiles}
          selectedId={selectedId}
          onSelect={onSelect}
          editable={editable}
          label={title}
        />
        {pins.length === 0 && routes.length === 0 && !editable ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
            <p className="flex items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-muted">
              <MapPinned className="size-icon-sm shrink-0" aria-hidden />
              {emptyMessage}
            </p>
          </div>
        ) : null}
        {!tiles ? (
          <p className="pointer-events-none absolute right-2 bottom-2 left-2 z-10 flex items-start gap-2 rounded-md border border-border bg-surface-raised px-3 py-2 text-xs text-text-muted md:left-auto md:max-w-popover">
            <Info className="mt-px size-3 shrink-0" aria-hidden />
            Map background unavailable. Pins and routes are still accurate.
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** Small legend row: a coloured dot and label per item. */
export function MapLegend({ items }: { items: { colour: MapPin["colour"]; label: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="flex min-w-0 items-center gap-2 text-xs text-text-muted">
          <span
            className={cn("size-2 shrink-0 rounded-full", `map-dot-${item.colour}`)}
            aria-hidden
          />
          <span className="truncate">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
