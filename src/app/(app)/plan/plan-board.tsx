"use client";

import { addDays, addWeeks, startOfWeek } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Map as MapIcon,
  Search,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MapPanel } from "@/components/map/map-panel";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SegmentedControl, Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/cn";
import { formatLocalDate, formatLocalDayShort, fromIsoDate } from "@/lib/format";

/**
 * Plan board layout (9.2). Loads, drag-and-drop and the rules engine arrive
 * in Stage 5; this sets out the working screen and its empty states.
 */
export function PlanBoard({ today }: { today: string }) {
  const [view, setView] = useState<"week" | "day">("week");
  const [weekends, setWeekends] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  const monday = addWeeks(startOfWeek(fromIsoDate(today), { weekStartsOn: 1 }), weekOffset);
  const days = Array.from({ length: weekends ? 7 : 5 }, (_, i) => addDays(monday, i));
  const shownDays = view === "day" ? days.slice(0, 1) : days;

  return (
    <PageContainer className="max-w-none">
      <PageHeader
        title="Plan"
        description={`Week commencing ${formatLocalDate(monday)}`}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowMap((s) => !s)}
              aria-pressed={showMap}
            >
              <MapIcon aria-hidden />
              {showMap ? "Hide map" : "Show map"}
            </Button>
            <Button variant="primary" disabled title="Add some orders first">
              <Sparkles aria-hidden />
              Suggest loads
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            iconOnly
            aria-label="Previous week"
            onClick={() => setWeekOffset((w) => w - 1)}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button variant="secondary" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>
            This week
          </Button>
          <Button
            variant="secondary"
            iconOnly
            aria-label="Next week"
            onClick={() => setWeekOffset((w) => w + 1)}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Toggle label="Sat/Sun" checked={weekends} onCheckedChange={setWeekends} />
          <SegmentedControl
            aria-label="View"
            value={view}
            onValueChange={setView}
            options={[
              { value: "week", label: "Week" },
              { value: "day", label: "Day" },
            ]}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-6 xl:flex-row">
        <aside
          aria-label="Unplanned orders"
          className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4 xl:w-popover xl:shrink-0"
        >
          <h2 className="text-sm font-semibold">Unplanned orders</h2>
          <Input
            leadingIcon={<Search />}
            placeholder="Search orders"
            aria-label="Search unplanned orders"
          />
          <EmptyState
            compact
            icon={ClipboardList}
            title="No unplanned orders"
            description="Orders waiting to be planned appear here. Drag one onto a load, or use “Add to load”."
            action={
              <Button asChild size="sm">
                <Link href="/orders">Go to orders</Link>
              </Button>
            }
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <div
            className={cn(
              "grid min-w-0 flex-1 gap-4",
              view === "day"
                ? "grid-cols-1"
                : weekends
                  ? "md:grid-cols-2 xl:grid-cols-7"
                  : "md:grid-cols-2 xl:grid-cols-5",
            )}
          >
            {shownDays.map((day) => (
              <section
                key={day.toISOString()}
                aria-label={formatLocalDayShort(day)}
                className="flex min-w-0 flex-col gap-2"
              >
                <h3 className="truncate text-sm font-semibold text-text-muted">
                  {formatLocalDayShort(day)}
                </h3>
                <div className="flex min-h-16 flex-1 items-center justify-center rounded-lg border border-dashed border-border-strong p-4 text-center text-sm text-text-subtle">
                  No loads
                </div>
              </section>
            ))}
          </div>
          {showMap ? (
            <MapPanel
              title="Orders and loads"
              pins={[]}
              emptyMessage="Unplanned orders and planned loads will appear here."
              onClose={() => setShowMap(false)}
              className="h-panel min-w-0"
            />
          ) : null}
        </div>
      </div>
    </PageContainer>
  );
}
