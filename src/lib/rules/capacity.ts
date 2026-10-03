import type { RuleLine, RuleUnitType, RuleVehicle } from "./context";

/**
 * How full a vehicle is (spec 6.3): the capacity matrix where a unit type has
 * an entry, otherwise floor space from the unit's footprint, stacking where
 * allowed. Mixed loads add up as shares of the vehicle.
 */

export type SpaceUse = {
  /** 1 = full. */
  share: number;
  /** Units that can't fit on this deck at all (too long, wide or tall). */
  tooBig: RuleUnitType[];
  /** When every line is one unit type in the matrix: "14 of 16 EUR". */
  units: { used: number; max: number; code: string } | null;
};

export type LineWithUnit = RuleLine & { unit: RuleUnitType | undefined };

function fitsDeck(u: RuleUnitType, v: RuleVehicle) {
  const flat =
    (u.length_mm <= v.deck_length_mm && u.width_mm <= v.deck_width_mm) ||
    (u.length_mm <= v.deck_width_mm && u.width_mm <= v.deck_length_mm);
  return flat && u.height_mm <= v.deck_height_mm;
}

export function spaceUse(lines: LineWithUnit[], vehicle: RuleVehicle): SpaceUse {
  let share = 0;
  const tooBig = new Map<string, RuleUnitType>();
  const deckArea = vehicle.deck_length_mm * vehicle.deck_width_mm;
  const totals = new Map<string, number>();

  for (const line of lines) {
    const u = line.unit;
    if (!u || line.quantity <= 0) continue;
    totals.set(u.id, (totals.get(u.id) ?? 0) + line.quantity);
    const max = vehicle.capacities[u.id];
    if (max) {
      share += line.quantity / max;
      continue;
    }
    if (!fitsDeck(u, vehicle)) {
      tooBig.set(u.id, u);
      continue;
    }
    const byHeight = Math.max(1, Math.floor(vehicle.deck_height_mm / u.height_mm));
    const perStack = u.stackable ? Math.min(u.max_stack_height ?? 1, byHeight) : 1;
    const stacks = Math.ceil(line.quantity / perStack);
    share += (stacks * u.length_mm * u.width_mm) / deckArea;
  }

  let units: SpaceUse["units"] = null;
  if (totals.size === 1) {
    const [[id, used]] = [...totals];
    const max = vehicle.capacities[id];
    const unit = lines.find((l) => l.unit?.id === id)!.unit!;
    if (max) units = { used, max, code: unit.short_code };
  }
  return { share, tooBig: [...tooBig.values()], units };
}

export const totalWeight = (lines: RuleLine[]) =>
  lines.reduce((sum, l) => sum + l.quantity * l.weight_per_unit_kg, 0);
