import { formatIsoDate, formatKg, formatMm } from "@/lib/format";
import type { PalletSize, PlanHaulier, PlanRateCard, PlanVehicle } from "@/lib/planning/types";
import { CHECKS } from "@/lib/rules";
import { spaceUse } from "@/lib/rules/capacity";
import type { RuleContext, RuleUnitType } from "@/lib/rules/context";
import { estimateRun } from "@/lib/rules/estimate";
import { siteHasForklift } from "@/lib/rules/unloading";

/**
 * Cheapest valid option (spec 8.2): every own vehicle and every haulier or
 * pallet network for a load, ranked by cost. Options that would fail a
 * blocking check come last, greyed, with the reason.
 */

export type CostLine = { label: string; amount: number };

export type DeliveryOption = {
  key: string;
  kind: "vehicle" | "haulier";
  id: string;
  name: string;
  detail: string;
  cost: number | null;
  /** Own-vehicle costs come from estimated time; haulier prices from the rate card. */
  estimate: boolean;
  breakdown: CostLine[];
  /** What the price leaves out, e.g. waiting time. */
  notes: string[];
  valid: boolean;
  reasons: string[];
  current: boolean;
};

/** Checks that depend on the vehicle; order readiness and the like don't. */
const VEHICLE_CHECKS = [
  "CAPACITY_SPACE",
  "CAPACITY_WEIGHT",
  "UPRIGHT_TAIL_LIFT",
  "TAIL_LIFT_WEIGHT",
  "NO_UNLOAD_METHOD",
  "SITE_VEHICLE_ACCESS",
];

/**
 * Standard UK pallet-network bands: the unit must fit a 1200 × 1000 mm pallet;
 * then height and weight decide quarter, half or full.
 */
const BANDS: { size: PalletSize; heightMm: number; weightKg: number }[] = [
  { size: "quarter", heightMm: 800, weightKg: 250 },
  { size: "half", heightMm: 1100, weightKg: 500 },
  { size: "full", heightMm: 2200, weightKg: 1000 },
];

export function palletSize(unit: RuleUnitType, weightKg: number): PalletSize | null {
  const fits =
    (unit.length_mm <= 1200 && unit.width_mm <= 1000) ||
    (unit.length_mm <= 1000 && unit.width_mm <= 1200);
  if (!fits) return null;
  return BANDS.find((b) => unit.height_mm <= b.heightMm && weightKg <= b.weightKg)?.size ?? null;
}

const PALLET_LABEL: Record<PalletSize, string> = { quarter: "quarter", half: "half", full: "full" };

/** A standard 13.6 m trailer, for deciding part or full load prices. */
const TRAILER = {
  deck_length_mm: 13600,
  deck_width_mm: 2480,
  deck_height_mm: 2700,
  capacities: {} as Record<string, number>,
};

const areaOf = (postcode: string) =>
  postcode
    .trim()
    .toUpperCase()
    .replace(/[0-9].*$/, "");
const districtOf = (postcode: string) => postcode.trim().toUpperCase().split(/\s+/)[0];
const money = (n: number) => Math.round(n * 100) / 100;

export type OptionInputs = {
  vehicles: PlanVehicle[];
  hauliers: PlanHaulier[];
  postcodeZones: { id: string; name: string; postcode_areas: string[] }[];
};

function vehicleOption(ctx: RuleContext, v: PlanVehicle): DeliveryOption {
  const swapped: RuleContext = {
    ...ctx,
    skipFixes: true,
    load: { ...ctx.load, vehicle: v, haulier: null },
  };
  const run = estimateRun(swapped);
  const reasons: string[] = [];
  const day = ctx.load.load_date;
  if (!v.active) reasons.push("Not in use");
  else if (
    v.off_road_from &&
    v.off_road_from <= day &&
    (!v.off_road_until || v.off_road_until >= day)
  ) {
    reasons.push(`Off road on ${formatIsoDate(day)}`);
  } else if (ctx.busyVehicleIds.includes(v.id)) reasons.push("Already on another load that day");
  for (const code of VEHICLE_CHECKS) {
    for (const w of CHECKS[code](swapped)) if (w.severity === "blocking") reasons.push(w.detail);
  }
  const crew = ctx.load.crew_size;
  const breakdown: CostLine[] = [];
  let cost: number | null = null;
  if (run.miles != null && run.dutyHours != null) {
    breakdown.push({
      label: `${run.miles.toFixed(0)} miles × £${v.cost_per_mile.toFixed(2)}`,
      amount: money(run.miles * v.cost_per_mile),
    });
    breakdown.push({
      label: `${run.dutyHours.toFixed(1)} hours × ${crew > 1 ? `${crew} people × ` : ""}£${v.cost_per_driver_hour.toFixed(2)}`,
      amount: money(run.dutyHours * crew * v.cost_per_driver_hour),
    });
    cost = money(breakdown.reduce((s, l) => s + l.amount, 0));
  }
  return {
    key: `vehicle:${v.id}`,
    kind: "vehicle",
    id: v.id,
    name: v.name,
    detail: run.roadDistances ? "Own vehicle · road distance" : "Own vehicle · estimated distance",
    cost,
    estimate: true,
    breakdown,
    notes: cost == null ? ["Some sites have no map position, so there's no distance."] : [],
    valid: reasons.length === 0,
    reasons,
    current: ctx.load.vehicle?.id === v.id,
  };
}

function cardFor(h: PlanHaulier, day: string): PlanRateCard | null {
  return (
    h.rateCards
      .filter((c) => c.valid_from <= day && (!c.valid_to || c.valid_to >= day))
      .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0] ?? null
  );
}

function haulierOption(ctx: RuleContext, h: PlanHaulier, inputs: OptionInputs): DeliveryOption {
  const base = {
    key: `haulier:${h.id}`,
    kind: "haulier" as const,
    id: h.id,
    name: h.name,
    detail:
      h.haulier_type === "pallet_network"
        ? "Pallet network"
        : h.haulier_type === "courier"
          ? "Courier"
          : "Haulier",
    estimate: false,
    current: ctx.load.haulier?.id === h.id,
  };
  const day = ctx.load.load_date;
  const invalid = (reasons: string[]): DeliveryOption => ({
    ...base,
    cost: null,
    breakdown: [],
    notes: [],
    valid: false,
    reasons,
  });

  const card = cardFor(h, day);
  if (!card) return invalid([`No rate card for ${formatIsoDate(day)}`]);

  const reasons: string[] = [];
  const uncovered = [...new Set(ctx.stops.map((s) => areaOf(s.site.postcode)))].filter(
    (a) => h.coverage_areas.length && !h.coverage_areas.includes(a),
  );
  if (uncovered.length) reasons.push(`Doesn't cover ${uncovered.join(", ")}`);

  const zoneFor = (postcode: string) =>
    inputs.postcodeZones.find((z) => z.postcode_areas.includes(areaOf(postcode)));
  const stopZones = ctx.stops.map((s) => ({ stop: s, zone: zoneFor(s.site.postcode) }));
  for (const { stop, zone } of stopZones) {
    if (!zone) reasons.push(`${stop.site.postcode} isn't in any of your postcode zones`);
  }

  // Pallet pricing: every unit must fit a pallet band and have a price in its stop's zone.
  let palletTotal: number | null = 0;
  const palletLines: CostLine[] = [];
  const palletProblems: string[] = [];
  for (const { stop, zone } of stopZones) {
    for (const o of stop.orders) {
      for (const l of o.lines) {
        const unit = ctx.unitTypes[l.unit_type_id];
        if (!unit) continue;
        const size = palletSize(unit, l.weight_per_unit_kg);
        const price = size && zone ? card.pallet[zone.id]?.[size] : undefined;
        if (!size) {
          palletProblems.push(
            `${unit.name} (${formatMm(unit.length_mm)} × ${formatMm(unit.width_mm)} × ${formatMm(unit.height_mm)}, ${formatKg(l.weight_per_unit_kg)}) won't go as a pallet`,
          );
        } else if (zone && price == null) {
          palletProblems.push(`No ${PALLET_LABEL[size]} pallet price for ${zone.name}`);
        } else if (price != null && palletTotal != null) {
          palletTotal += price * l.quantity;
          palletLines.push({
            label: `${o.order_ref}: ${l.quantity} × ${PALLET_LABEL[size]} pallet (${zone!.name})`,
            amount: money(price * l.quantity),
          });
        }
      }
    }
  }
  if (palletProblems.length) palletTotal = null;

  // Load pricing: the dearest zone on the route, part load up to half a trailer.
  let loadTotal: number | null = null;
  let loadLine: CostLine | null = null;
  const zones = stopZones.map((z) => z.zone).filter((z): z is NonNullable<typeof z> => Boolean(z));
  if (zones.length === ctx.stops.length && zones.every((z) => card.load[z.id])) {
    const lines = ctx.stops.flatMap((s) => s.orders.flatMap((o) => o.lines));
    const share = spaceUse(
      lines.map((l) => ({ ...l, unit: ctx.unitTypes[l.unit_type_id] })),
      TRAILER,
    ).share;
    const type = share <= 0.5 ? "part" : "full";
    const priced = zones
      .map((z) => ({ z, price: card.load[z.id]?.[type] ?? card.load[z.id]?.full }))
      .filter((p): p is { z: (typeof zones)[number]; price: number } => p.price != null)
      .sort((a, b) => b.price - a.price)[0];
    if (priced) {
      loadTotal = priced.price;
      loadLine = {
        label: `${type === "part" ? "Part" : "Full"} load (${priced.z.name})`,
        amount: money(priced.price),
      };
    }
  }

  const usePallets = palletTotal != null && (loadTotal == null || palletTotal <= loadTotal);
  if (palletTotal == null && loadTotal == null) {
    reasons.push(
      ...(palletProblems.length
        ? palletProblems.slice(0, 2)
        : [`No prices on ${card.name} for these zones`]),
    );
  }

  const breakdown: CostLine[] = usePallets ? palletLines : loadLine ? [loadLine] : [];
  const drops = ctx.stops.length;
  if (card.per_drop) breakdown.push({ label: "Drop charge", amount: money(card.per_drop) });
  if (drops > 1 && card.extra_drop)
    breakdown.push({
      label: `${drops - 1} extra ${drops - 1 === 1 ? "drop" : "drops"}`,
      amount: money(card.extra_drop * (drops - 1)),
    });

  // Surcharges, and services the haulier must offer.
  const needsTailLift = ctx.stops.filter((s) => !siteHasForklift(s.site));
  if (needsTailLift.length) {
    if (!h.services.includes("tail_lift"))
      reasons.push(`No tail lift service, and ${needsTailLift[0].site.name} has no forklift`);
    const units = needsTailLift
      .flatMap((s) => s.orders.flatMap((o) => o.lines))
      .reduce((n, l) => n + l.quantity, 0);
    if (card.surcharge_tail_lift_per_pallet && usePallets) {
      breakdown.push({
        label: `Tail lift, ${units} × £${card.surcharge_tail_lift_per_pallet.toFixed(2)}`,
        amount: money(units * card.surcharge_tail_lift_per_pallet),
      });
    }
  }
  const timed = ctx.stops.filter(
    (s) => s.booking_slot || s.orders.some((o) => o.urgency != null && o.urgency !== "standard"),
  );
  if (timed.length) {
    if (!h.services.includes("timed")) reasons.push("No timed delivery service");
    if (card.surcharge_timed)
      breakdown.push({
        label: `Timed delivery × ${timed.length}`,
        amount: money(card.surcharge_timed * timed.length),
      });
  }
  const remote = ctx.stops.filter((s) =>
    card.remote_postcodes.some(
      (p) => p === districtOf(s.site.postcode) || p === areaOf(s.site.postcode),
    ),
  );
  if (remote.length && card.surcharge_remote_area) {
    breakdown.push({
      label: `Remote area × ${remote.length}`,
      amount: money(card.surcharge_remote_area * remote.length),
    });
  }
  const twoPerson = ctx.stops.filter((s) =>
    s.orders.some((o) => o.lines.some((l) => ctx.unitTypes[l.unit_type_id]?.requires_two_people)),
  );
  if (twoPerson.length) {
    if (!h.services.includes("two_person")) reasons.push("No two-person delivery service");
    if (card.surcharge_two_person)
      breakdown.push({
        label: `Two-person × ${twoPerson.length}`,
        amount: money(card.surcharge_two_person * twoPerson.length),
      });
  }

  const valid = reasons.length === 0;
  return {
    ...base,
    cost: valid ? money(breakdown.reduce((s, l) => s + l.amount, 0)) : null,
    breakdown: valid ? breakdown : [],
    notes: card.waiting_per_hour
      ? [
          `Waiting over ${card.waiting_free_minutes} minutes is £${card.waiting_per_hour.toFixed(2)} an hour extra.`,
        ]
      : [],
    valid,
    reasons,
  };
}

/** Every option for this load: valid ones cheapest first, then invalid ones with reasons. */
export function deliveryOptions(ctx: RuleContext, inputs: OptionInputs): DeliveryOption[] {
  if (!ctx.stops.length) return [];
  const all = [
    ...inputs.vehicles.filter((v) => v.active).map((v) => vehicleOption(ctx, v)),
    ...inputs.hauliers.map((h) => haulierOption(ctx, h, inputs)),
  ];
  return all.sort((a, b) => {
    if (a.valid !== b.valid) return a.valid ? -1 : 1;
    if (a.cost == null || b.cost == null) return a.cost == null ? 1 : -1;
    return a.cost - b.cost || a.name.localeCompare(b.name);
  });
}
