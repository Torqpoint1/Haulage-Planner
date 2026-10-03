"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { addDays, addWeeks, format } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Map as MapIcon,
  Plus,
  Sparkles,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { MapLegend, MapPanel } from "@/components/map/map-panel";
import { loadColour, type MapPin, type MapRoute } from "@/components/map/types";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { SegmentedControl, Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/cn";
import { formatLocalDate, formatLocalDayShort, fromIsoDate } from "@/lib/format";
import { buildContext, loadMetrics, loadWarnings } from "@/lib/planning/build";
import { unitsText } from "@/lib/planning/labels";
import type { PlanData } from "@/lib/planning/types";
import { legBetween, legKey } from "@/lib/routing/legs";
import type { LoadProposal, Unplaced } from "@/lib/suggestions/suggest-loads";
import type { WarningFix } from "@/lib/rules/types";
import type { FormState } from "@/lib/settings/result";
import { addOrderToLoad, removeOrderFromLoad, suggestLoadsAction, updateLoad } from "./actions";
import { CompareModal } from "./compare-modal";
import { LoadCard, type LoadView } from "./load-card";
import { LoadFormModal } from "./load-form";
import { LoadPanel, type StopFocus } from "./load-panel";
import { OrderPool } from "./order-pool";
import { ProposalCard } from "./proposal-card";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Drop where the pointer is; keyboard dragging (no pointer) falls back to overlap. */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

type Props = {
  data: PlanData;
  today: string;
  nowIso: string;
  view: "week" | "day";
  day: string | null;
  weekends: boolean;
  selectedLoadId: string | null;
  canEdit: boolean;
  canApprove: boolean;
  canOverride: boolean;
};

export function PlanBoard({
  data,
  today,
  nowIso,
  view,
  day,
  weekends,
  selectedLoadId,
  canEdit,
  canApprove,
  canOverride,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startNav] = useTransition();
  const [, startAction] = useTransition();
  const [showMap, setShowMap] = useState(false);
  const [showPool, setShowPool] = useState(true);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [overLoadId, setOverLoadId] = useState<string | null>(null);
  const [form, setForm] = useState<{
    loadId: string | null;
    date: string;
    orderId?: string;
  } | null>(null);
  const [focus, setFocus] = useState<StopFocus>(null);
  const [suggesting, startSuggest] = useTransition();
  // Suggestions belong to the week they were made for.
  const [suggestions, setSuggestions] = useState<{
    from: string;
    proposals: LoadProposal[];
    unplaced: Unplaced[];
  } | null>(null);
  const [showUnplaced, setShowUnplaced] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [compare, setCompare] = useState<string | null>(null);

  const monday = fromIsoDate(data.from);
  const allDays = Array.from({ length: 7 }, (_, i) => iso(addDays(monday, i)));
  const weekDays = weekends ? allDays : allDays.slice(0, 5);
  const currentDay = day ?? (allDays.includes(today) ? today : allDays[0]);
  const shownDays = view === "day" ? [currentDay] : weekDays;
  const weekEnd = allDays[6];

  function navigate(patch: Record<string, string | null>) {
    const params = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    startNav(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  // Warnings and capacity for every load, recalculated whenever the data changes.
  const clock = useMemo(() => ({ now: new Date(nowIso), today }), [nowIso, today]);
  const views = useMemo(() => {
    const out: Record<string, LoadView> = {};
    for (const load of data.loads) {
      const ctx = buildContext(load, data, clock);
      out[load.id] = { load, metrics: loadMetrics(ctx, data), warnings: loadWarnings(ctx, data) };
    }
    return out;
  }, [data, clock]);

  // While an order is dragged over a load, show the load as if it were dropped (9.2).
  const preview = useMemo(() => {
    if (!activeOrderId || !overLoadId) return null;
    const load = data.loads.find((l) => l.id === overLoadId);
    if (!load) return null;
    return loadMetrics(buildContext(load, data, clock, [activeOrderId]), data);
  }, [activeOrderId, overLoadId, data, clock]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  function addToLoad(orderId: string, loadId: string) {
    const order = data.orders[orderId];
    startAction(async () => {
      const r = await addOrderToLoad(loadId, orderId);
      if (r.ok) toast.success(`${order?.order_ref ?? "Order"} added to the load`);
      else toast.error(r.error);
    });
  }

  function onDragStart(e: DragStartEvent) {
    setActiveOrderId(String(e.active.id).replace("order:", ""));
  }
  function onDragOver(e: DragOverEvent) {
    const id = e.over ? String(e.over.id) : "";
    setOverLoadId(id.startsWith("load:") ? id.slice(5) : null);
  }
  function onDragEnd(e: DragEndEvent) {
    const orderId = String(e.active.id).replace("order:", "");
    const id = e.over ? String(e.over.id) : "";
    setActiveOrderId(null);
    setOverLoadId(null);
    if (id.startsWith("load:")) addToLoad(orderId, id.slice(5));
  }

  const live = suggestions?.from === data.from ? suggestions : null;
  const dropProposal = (key: string) =>
    setSuggestions((s) => (s ? { ...s, proposals: s.proposals.filter((p) => p.key !== key) } : s));

  function suggest() {
    startSuggest(async () => {
      const r = await suggestLoadsAction(data.from, data.to, shownDays);
      if (!r.ok) return void toast.error(r.error);
      setSuggestions({ from: data.from, proposals: r.proposals, unplaced: r.unplaced });
      setShowUnplaced(false);
      if (r.proposals.length) {
        toast.success(
          `${r.proposals.length} suggested ${r.proposals.length === 1 ? "load" : "loads"}: check them on the board`,
        );
      } else
        toast.info(
          r.unplaced.length
            ? "No loads to suggest; see why above the board."
            : "No unplanned orders to suggest loads for.",
        );
    });
  }

  function applyFix(fix: WarningFix, v: LoadView) {
    const p = fix.params ?? {};
    const done = (message: string) => (r: { ok: boolean; error?: string }) => {
      if (r.ok) toast.success(message);
      else toast.error(r.error ?? "That didn't work. Try again.");
    };
    switch (fix.id) {
      case "switch-vehicle":
        startAction(async () =>
          done("Vehicle changed")(await updateLoad(v.load.id, { vehicle_id: String(p.vehicleId) })),
        );
        break;
      case "set-crew":
        startAction(async () =>
          done("Crew updated")(await updateLoad(v.load.id, { crew_size: Number(p.crew) })),
        );
        break;
      case "remove-order":
        startAction(async () =>
          done("Order taken off the load")(await removeOrderFromLoad(String(p.orderId))),
        );
        break;
      case "move-load-date": {
        const date = String(p.date);
        startAction(async () => {
          const r = await updateLoad(v.load.id, { load_date: date });
          done(`Load moved to ${formatLocalDate(fromIsoDate(date))}`)(r);
          if (r.ok && (date < data.from || date > data.to)) navigate({ week: date, day: null });
        });
        break;
      }
      case "edit-stop":
        setFocus({ stopId: String(p.stopId), field: String(p.field) });
        break;
      case "edit-load":
        setForm({ loadId: v.load.id, date: v.load.load_date });
        break;
      case "verify-site":
        router.push(`/customers/${p.customerId}/sites/${p.siteId}`);
        break;
    }
  }

  const selected = selectedLoadId ? (views[selectedLoadId] ?? null) : null;

  // Map (9.2): unplanned orders coloured by when they're needed; loads in their own colours with routes.
  const { pins, routes } = useMemo(() => {
    const pins: MapPin[] = [];
    const routes: MapRoute[] = [];
    for (const id of data.pool) {
      const o = data.orders[id];
      const s = o && data.sites[o.site_id];
      if (s?.latitude == null || s.longitude == null) continue;
      pins.push({
        id: `order:${o.id}`,
        lat: s.latitude,
        lng: s.longitude,
        label: `${o.order_ref}, ${s.name}, needed ${formatLocalDate(fromIsoDate(o.required_date))}`,
        colour:
          o.required_date < today ? "load-6" : o.required_date <= weekEnd ? "load-3" : "neutral",
      });
    }
    data.loads.forEach((l, i) => {
      const colour = loadColour(i + 1);
      const depot = data.depots.find((d) => d.id === l.depot_id);
      const stops = l.stops
        .map((st) => data.sites[st.site_id])
        .filter((s) => s?.latitude != null && s.longitude != null);
      l.stops.forEach((st) => {
        const s = data.sites[st.site_id];
        if (s?.latitude == null || s.longitude == null) return;
        pins.push({
          id: `load:${l.id}:${st.id}`,
          lat: s.latitude,
          lng: s.longitude,
          label: `Stop ${st.sequence}: ${s.name}`,
          colour,
        });
      });
      if (!depot || depot.latitude == null || !stops.length) return;
      const points = [depot, ...stops, depot];
      const line: [number, number][] = [];
      for (let k = 1; k < points.length; k++) {
        const key = legKey(points[k - 1], points[k]);
        const shape = key ? data.legs[key]?.geometry : null;
        if (shape?.length) line.push(...shape);
        else if (legBetween(data.legs, points[k - 1], points[k])) {
          line.push(
            [points[k - 1].latitude!, points[k - 1].longitude!],
            [points[k].latitude!, points[k].longitude!],
          );
        }
      }
      routes.push({ id: `route:${l.id}`, colour, points: line });
    });
    return { pins, routes };
  }, [data, today, weekEnd]);

  function selectPin(id: string) {
    if (id.startsWith("order:")) {
      setSelectedOrderId(id.slice(6));
      setShowPool(true);
    } else if (id.startsWith("load:")) navigate({ load: id.split(":")[1] });
  }

  const activeOrder = activeOrderId ? data.orders[activeOrderId] : null;

  return (
    <PageContainer className="max-w-none">
      <PageHeader
        title="Plan"
        description={
          view === "day"
            ? formatLocalDayShort(fromIsoDate(currentDay))
            : `Week commencing ${formatLocalDate(monday)}`
        }
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowPool((s) => !s)}
              aria-pressed={showPool}
            >
              <ClipboardList aria-hidden />
              {showPool ? "Hide orders" : `Show orders (${data.pool.length})`}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowMap((s) => !s)}
              aria-pressed={showMap}
            >
              <MapIcon aria-hidden />
              {showMap ? "Hide map" : "Show map"}
            </Button>
            {canEdit ? (
              <Button variant="primary" loading={suggesting} onClick={suggest}>
                <Sparkles aria-hidden />
                Suggest loads
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            iconOnly
            aria-label={view === "day" ? "Previous day" : "Previous week"}
            onClick={() =>
              view === "day"
                ? navigate({
                    week: iso(addDays(fromIsoDate(currentDay), -1)),
                    day: iso(addDays(fromIsoDate(currentDay), -1)),
                  })
                : navigate({ week: iso(addWeeks(monday, -1)), day: null })
            }
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate({ week: null, day: null })}
            disabled={allDays.includes(today) && (view === "week" || currentDay === today)}
          >
            {view === "day" ? "Today" : "This week"}
          </Button>
          <Button
            variant="secondary"
            iconOnly
            aria-label={view === "day" ? "Next day" : "Next week"}
            onClick={() =>
              view === "day"
                ? navigate({
                    week: iso(addDays(fromIsoDate(currentDay), 1)),
                    day: iso(addDays(fromIsoDate(currentDay), 1)),
                  })
                : navigate({ week: iso(addWeeks(monday, 1)), day: null })
            }
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {view === "week" ? (
            <Toggle
              label="Sat/Sun"
              checked={weekends}
              onCheckedChange={(on) => navigate({ weekend: on ? "1" : null })}
            />
          ) : null}
          <SegmentedControl
            aria-label="View"
            value={view}
            onValueChange={(v) =>
              navigate({ view: v === "day" ? "day" : null, day: v === "day" ? currentDay : null })
            }
            options={[
              { value: "week", label: "Week" },
              { value: "day", label: "Day" },
            ]}
          />
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveOrderId(null);
          setOverLoadId(null);
        }}
      >
        <div className="flex min-w-0 flex-col gap-6 xl:flex-row xl:items-start">
          {showPool ? (
            <OrderPool
              data={data}
              today={today}
              weekEnd={weekEnd}
              canEdit={canEdit}
              activeOrderId={activeOrderId}
              selectedOrderId={selectedOrderId}
              mapOpen={showMap}
              onAdd={addToLoad}
              onNewLoad={(orderId) => setForm({ loadId: null, date: currentDay, orderId })}
              onCompare={setCompare}
              onSelect={(id) => setSelectedOrderId((cur) => (cur === id ? null : id))}
            />
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col gap-6">
            {live ? (
              <Card className="flex min-w-0 flex-col gap-2 p-4" role="status">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    <span className="font-medium">
                      {live.proposals.length} suggested{" "}
                      {live.proposals.length === 1 ? "load" : "loads"}
                    </span>
                    {live.unplaced.length
                      ? ` · ${live.unplaced.length} ${live.unplaced.length === 1 ? "order" : "orders"} not included`
                      : ""}
                    . Nothing changes until you accept one.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {live.unplaced.length ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-expanded={showUnplaced}
                        onClick={() => setShowUnplaced((v) => !v)}
                      >
                        {showUnplaced ? "Hide why" : "Why not included?"}
                      </Button>
                    ) : null}
                    <Button size="sm" onClick={() => setSuggestions(null)}>
                      Clear suggestions
                    </Button>
                  </div>
                </div>
                {showUnplaced ? (
                  <ul className="flex flex-col gap-1" aria-label="Orders not included">
                    {live.unplaced.map((u) => (
                      <li key={u.orderId} className="text-sm break-words text-text-muted">
                        <span className="font-medium text-text">{u.orderRef}</span>: {u.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Card>
            ) : null}
            <div
              className={cn(
                "grid min-w-0 gap-4",
                view === "day"
                  ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                  : // Days sit side by side on wide screens and scroll as a row if they can't all fit.
                    "md:grid-cols-2 xl:flex xl:overflow-x-auto xl:pb-2 xl:scrollbar-thin",
              )}
              {...(view === "week" ? { role: "group", "aria-label": "Days", tabIndex: 0 } : {})}
            >
              {(view === "day" ? [currentDay] : shownDays).map((d) => {
                const dayLoads = data.loads.filter((l) => l.load_date === d);
                const dayProposals = live?.proposals.filter((p) => p.date === d) ?? [];
                const isPast = d < today;
                return (
                  <section
                    key={d}
                    aria-label={formatLocalDayShort(fromIsoDate(d))}
                    className={cn(
                      "flex min-w-0 flex-col gap-2",
                      view === "day" ? "md:col-span-2 xl:col-span-3" : "xl:min-w-day xl:flex-1",
                    )}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <h2
                        className={cn(
                          "truncate text-sm font-semibold",
                          d === today ? "text-accent-text" : "text-text-muted",
                        )}
                      >
                        {formatLocalDayShort(fromIsoDate(d))}
                        {d === today ? " · Today" : ""}
                      </h2>
                      {canEdit && !isPast ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          iconOnly
                          onClick={() => setForm({ loadId: null, date: d })}
                          aria-label={`New load on ${formatLocalDayShort(fromIsoDate(d))}`}
                        >
                          <Plus aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                    <div
                      className={cn(
                        "grid min-w-0 gap-2",
                        view === "day" && "md:grid-cols-2 xl:grid-cols-3",
                      )}
                    >
                      {dayProposals.map((p) => (
                        <ProposalCard
                          key={p.key}
                          proposal={p}
                          data={data}
                          onDone={() => dropProposal(p.key)}
                          onEdit={(loadId) => navigate({ load: loadId })}
                        />
                      ))}
                      {dayLoads.length ? (
                        dayLoads.map((l) => (
                          <LoadCard
                            key={l.id}
                            view={views[l.id]}
                            data={data}
                            preview={overLoadId === l.id ? preview : null}
                            selected={selectedLoadId === l.id}
                            dropEnabled={canEdit}
                            onOpen={() => navigate({ load: l.id })}
                          />
                        ))
                      ) : dayProposals.length ? null : (
                        <div className="flex min-h-16 items-center justify-center rounded-lg border border-dashed border-border-strong p-4 text-center text-sm text-text-subtle">
                          No loads
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
            {showMap ? (
              <MapPanel
                title="Orders and loads"
                pins={pins}
                routes={routes}
                selectedId={selectedOrderId ? `order:${selectedOrderId}` : null}
                onSelect={selectPin}
                legend={
                  <MapLegend
                    items={[
                      { colour: "load-6", label: "Overdue" },
                      { colour: "load-3", label: "Due this week" },
                      { colour: "neutral", label: "Due later" },
                      ...(data.loads.length
                        ? [{ colour: loadColour(1), label: "Loads (one colour each)" }]
                        : []),
                    ]}
                  />
                }
                emptyMessage="Unplanned orders and planned loads will appear here."
                onClose={() => setShowMap(false)}
                className="h-panel min-w-0"
              />
            ) : null}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeOrder ? (
            <div className="flex w-popover flex-col gap-1 rounded-md border border-accent bg-surface p-3 shadow-overlay">
              <span className="text-sm font-semibold">{activeOrder.order_ref}</span>
              <span className="truncate text-xs text-text-muted">
                {activeOrder.customer_name} · {unitsText([activeOrder], data.unitTypes)}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <LoadPanel
        view={selected}
        data={data}
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setFocus(null);
            navigate({ load: null });
          }
        }}
        canEdit={canEdit}
        canApprove={canApprove}
        canOverride={canOverride}
        onFix={applyFix}
        onEdit={() =>
          selected && setForm({ loadId: selected.load.id, date: selected.load.load_date })
        }
        focus={focus}
        onFocusDone={() => setFocus(null)}
      />

      {form ? (
        <LoadFormModal
          key={form.loadId ?? `new-${form.date}`}
          open
          onOpenChange={(open) => !open && setForm(null)}
          data={data}
          load={form.loadId ? (data.loads.find((l) => l.id === form.loadId) ?? null) : null}
          defaultDate={form.date}
          onSaved={(state: FormState) => {
            const pendingOrder = form.orderId;
            setForm(null);
            toast.success(form.loadId ? "Load saved" : "Load created");
            if (state.id && pendingOrder) addToLoad(pendingOrder, state.id);
            if (state.id && !form.loadId) navigate({ load: state.id });
          }}
        />
      ) : null}
      {compare && data.orders[compare] ? (
        <CompareModal
          orderId={compare}
          orderRef={data.orders[compare].order_ref}
          onClose={() => setCompare(null)}
        />
      ) : null}
    </PageContainer>
  );
}
