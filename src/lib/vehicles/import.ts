import type { CsvTable } from "@/lib/csv";
import {
  fieldReader,
  rowNumber,
  yesNo,
  type FieldMapping,
  type ImportField,
  type ImportProblem,
} from "@/lib/import/mapping";
import type { FormObject } from "@/lib/settings/form";
import { UNLOAD_METHODS, VEHICLE_TYPES } from "@/lib/settings/options";
import { parseVehicle } from "@/lib/settings/schemas";

/**
 * Vehicle CSV import (spec 11): one row per vehicle, checked with the same
 * rules as the vehicle form. Registrations already in the fleet are rejected
 * rather than changed.
 */

export const VEHICLE_IMPORT_FIELDS = [
  { key: "name", label: "Name", required: true, aliases: ["vehicle", "vehicle name", "fleet no"] },
  {
    key: "registration",
    label: "Registration",
    required: true,
    aliases: ["reg", "reg no", "registration number", "vrm", "number plate"],
  },
  {
    key: "vehicle_type",
    label: "Vehicle type",
    required: true,
    hint: "e.g. Van, 7.5 tonne, 18 tonne, Artic",
    aliases: ["type", "body type", "class"],
  },
  {
    key: "ownership",
    label: "Owned or hired",
    hint: "Blank means owned",
    aliases: ["ownership", "owned", "hired"],
  },
  {
    key: "deck_length_mm",
    label: "Deck length (mm)",
    required: true,
    aliases: ["deck length", "length mm", "bed length", "internal length"],
  },
  {
    key: "deck_width_mm",
    label: "Deck width (mm)",
    required: true,
    aliases: ["deck width", "width mm", "internal width"],
  },
  {
    key: "deck_height_mm",
    label: "Deck height (mm)",
    required: true,
    aliases: ["deck height", "height mm", "internal height"],
  },
  {
    key: "payload_kg",
    label: "Payload (kg)",
    required: true,
    aliases: ["payload", "max payload"],
  },
  {
    key: "gross_weight_kg",
    label: "Gross weight (kg)",
    required: true,
    aliases: ["gross weight", "gvw", "gross vehicle weight"],
  },
  {
    key: "overall_length_m",
    label: "Overall length (m)",
    required: true,
    aliases: ["overall length", "length m", "vehicle length"],
  },
  {
    key: "unload_methods",
    label: "Unloading",
    hint: "Tail lift, side, rear, crane; separate with commas",
    aliases: ["unload methods", "unloading methods", "unload"],
  },
  { key: "tail_lift_max_kg", label: "Tail lift max (kg)", aliases: ["tail lift kg", "tail lift"] },
  { key: "crane_max_kg", label: "Crane max (kg)", aliases: ["crane kg", "crane"] },
  {
    key: "crew_size_default",
    label: "Crew",
    hint: "1 or 2; blank means 1",
    aliases: ["crew size", "crew size default", "default crew"],
  },
  { key: "euro_standard", label: "Euro standard", aliases: ["euro", "emissions"] },
  {
    key: "caz_compliant",
    label: "Clean air zone compliant",
    hint: "Yes or no",
    aliases: ["caz", "caz compliant", "ulez", "ulez compliant"],
  },
  {
    key: "cost_per_mile",
    label: "Cost per mile (£)",
    aliases: ["cost per mile", "per mile", "mileage cost"],
  },
  {
    key: "cost_per_driver_hour",
    label: "Cost per driver hour (£)",
    aliases: ["cost per driver hour", "driver hour", "hourly cost"],
  },
] as const satisfies readonly ImportField[];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();

/** "18 tonne", "18t", "18T" → "18t"; unknown → null. */
function vehicleType(raw: string): string | null {
  const v = norm(raw);
  if (!v) return null;
  const hit = VEHICLE_TYPES.find(
    (t) => norm(t.value) === v || norm(t.label) === v || norm(t.label).split(" ")[0] === v,
  );
  if (hit) return hit.value;
  const tonnes = v.match(/^(\d+(?:\.\d+)?)\s*(?:t|tonne|tonnes|ton)$/);
  if (tonnes) return VEHICLE_TYPES.find((t) => t.value === `${tonnes[1]}t`)?.value ?? null;
  return null;
}

function unloadMethods(raw: string): { values: string[]; unknown: string[] } {
  const values: string[] = [];
  const unknown: string[] = [];
  for (const part of raw
    .split(/[,;/|]+/)
    .map(norm)
    .filter(Boolean)) {
    const hit = UNLOAD_METHODS.find(
      (m) =>
        norm(m.value) === part ||
        norm(m.label) === part ||
        norm(m.label).startsWith(part) ||
        norm(m.value.replace("_", " ")) === part,
    );
    if (hit) {
      if (!values.includes(hit.value)) values.push(hit.value);
    } else unknown.push(part);
  }
  return { values, unknown };
}

/** Strips £, commas and units ("7,500 kg") so spreadsheets' formatting doesn't matter. */
const figure = (raw: string) =>
  raw
    .replace(/[£,]/g, "")
    .replace(/\s*(kg|mm|m|t)$/i, "")
    .trim();

export type VehicleImportPlan = {
  vehicles: Extract<ReturnType<typeof parseVehicle>, { ok: true }>["data"][];
  rowCount: number;
  rejected: ImportProblem[];
};

export function planVehicleImport(
  table: CsvTable,
  mapping: FieldMapping,
  existingRegistrations: string[],
): VehicleImportPlan {
  const get = fieldReader(VEHICLE_IMPORT_FIELDS, table.headers, mapping);
  const regKey = (r: string) => r.toUpperCase().replace(/\s+/g, "");
  const taken = new Set(existingRegistrations.map(regKey));
  const seen = new Set<string>();
  const vehicles: VehicleImportPlan["vehicles"] = [];
  const rejected: ImportProblem[] = [];

  table.rows.forEach((row, i) => {
    const errors: string[] = [];
    const rawType = get(row, "vehicle_type");
    const type = vehicleType(rawType);
    if (rawType && !type) {
      errors.push(
        `“${rawType}” isn't a vehicle type. Use one of: ${VEHICLE_TYPES.map((t) => t.label).join(", ")}.`,
      );
    }
    const rawOwnership = norm(get(row, "ownership"));
    const hired = rawOwnership.startsWith("hire");
    if (rawOwnership && !hired && !rawOwnership.startsWith("own")) {
      errors.push(`Owned or hired should say owned or hired, not “${get(row, "ownership")}”.`);
    }
    const methods = unloadMethods(get(row, "unload_methods"));
    if (methods.unknown.length) {
      errors.push(
        `Unloading “${methods.unknown.join(", ")}” isn't recognised. Use tail lift, side, rear or crane.`,
      );
    }
    const caz = yesNo(get(row, "caz_compliant"));
    if (caz === null) {
      errors.push(
        `Clean air zone compliant should be yes or no, not “${get(row, "caz_compliant")}”.`,
      );
    }

    const input: FormObject = {
      name: get(row, "name"),
      registration: get(row, "registration"),
      vehicle_type: type ?? rawType,
      ownership: hired ? "hired" : "owned",
      deck_length_mm: figure(get(row, "deck_length_mm")),
      deck_width_mm: figure(get(row, "deck_width_mm")),
      deck_height_mm: figure(get(row, "deck_height_mm")),
      payload_kg: figure(get(row, "payload_kg")),
      gross_weight_kg: figure(get(row, "gross_weight_kg")),
      overall_length_m: figure(get(row, "overall_length_m")),
      unload_methods: methods.values,
      tail_lift_max_kg: figure(get(row, "tail_lift_max_kg")),
      crane_max_kg: figure(get(row, "crane_max_kg")),
      crew_size_default: get(row, "crew_size_default") || "1",
      euro_standard: get(row, "euro_standard"),
      caz_compliant: caz ? "on" : "",
      cost_per_mile: figure(get(row, "cost_per_mile")) || "0",
      cost_per_driver_hour: figure(get(row, "cost_per_driver_hour")) || "0",
      active: "on",
    };
    const parsed = parseVehicle(input);
    if (!parsed.ok) {
      for (const [field, message] of Object.entries(parsed.errors)) {
        // The type and unloading messages above are clearer than the form's.
        if (field === "vehicle_type" && rawType && !type) continue;
        if (field === "unload_methods" && methods.unknown.length) continue;
        errors.push(message);
      }
    }
    const reg = regKey(get(row, "registration"));
    if (reg && taken.has(reg)) errors.push(`${get(row, "registration")} is already in your fleet.`);
    else if (reg && seen.has(reg)) errors.push(`${get(row, "registration")} is listed twice.`);
    if (reg) seen.add(reg);

    if (errors.length || !parsed.ok) {
      rejected.push({
        row: rowNumber(i),
        ref: get(row, "registration") || get(row, "name"),
        errors,
      });
      return;
    }
    vehicles.push(parsed.data);
  });

  return { vehicles, rowCount: table.rows.length, rejected };
}

/** Wording and template for the vehicle import wizard. */
export function vehicleImportCopy() {
  const example: Record<string, string> = {
    name: "18t curtainsider 2",
    registration: "AB12 CDE",
    vehicle_type: "18 tonne",
    ownership: "Owned",
    deck_length_mm: "7300",
    deck_width_mm: "2480",
    deck_height_mm: "2500",
    payload_kg: "9500",
    gross_weight_kg: "18000",
    overall_length_m: "9.8",
    unload_methods: "Tail lift, side",
    tail_lift_max_kg: "1000",
    crew_size_default: "1",
    euro_standard: "Euro 6",
    caz_compliant: "Yes",
    cost_per_mile: "0.85",
    cost_per_driver_hour: "16.50",
  };
  return {
    noun: ["vehicle", "vehicles"] as [string, string],
    fields: VEHICLE_IMPORT_FIELDS,
    refLabel: "Registration",
    fileHint: "One row per vehicle. Load capacities are set on each vehicle afterwards.",
    needHint: "You need each vehicle's name, registration, type, deck size and weights.",
    templateName: "vehicle-import-template.csv",
    templateRows: [
      example,
      {
        ...example,
        name: "Van 3",
        registration: "XY70 VAN",
        vehicle_type: "Van",
        deck_length_mm: "3400",
        deck_width_mm: "1750",
        deck_height_mm: "1900",
        payload_kg: "1200",
        gross_weight_kg: "3500",
        overall_length_m: "5.9",
        unload_methods: "Rear",
        tail_lift_max_kg: "",
      },
    ],
    problemsName: "vehicle-import-problems",
    doneHref: "/settings/vehicles",
    doneLabel: "View vehicles",
  };
}
