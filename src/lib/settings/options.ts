/**
 * Fixed choices used by settings forms. Values match the database CHECK
 * constraints; labels are what people see.
 */

type Option<T extends string> = { value: T; label: string };

function options<T extends string>(entries: [T, string][]): Option<T>[] {
  return entries.map(([value, label]) => ({ value, label }));
}

export function labelFor<T extends string>(list: Option<T>[], value: T | string): string {
  return list.find((o) => o.value === value)?.label ?? value;
}

export const VEHICLE_TYPES = options([
  ["van", "Van"],
  ["luton", "Luton"],
  ["7.5t", "7.5 tonne"],
  ["12t", "12 tonne"],
  ["18t", "18 tonne"],
  ["26t", "26 tonne"],
  ["artic", "Artic"],
  ["flatbed", "Flatbed"],
  ["curtainsider", "Curtainsider"],
  ["hiab", "HIAB / crane"],
  ["other", "Other"],
] as const);
export type VehicleType = (typeof VEHICLE_TYPES)[number]["value"];

export const UNLOAD_METHODS = options([
  ["tail_lift", "Tail lift"],
  ["side", "Side access (curtainsider)"],
  ["rear", "Rear only"],
  ["crane", "Crane"],
] as const);

export const LOADING_EQUIPMENT = options([
  ["forklift", "Forklift"],
  ["loading_dock", "Loading dock"],
  ["pallet_truck", "Pallet truck"],
  ["moffett", "Moffett"],
  ["crane", "Crane"],
] as const);

export const LICENCE_CATEGORIES = options([
  ["B", "B (car, up to 3.5t)"],
  ["B+E", "B+E"],
  ["C1", "C1 (up to 7.5t)"],
  ["C1+E", "C1+E"],
  ["C", "C (rigid HGV)"],
  ["C+E", "C+E (artic)"],
  ["D1", "D1"],
  ["D", "D"],
] as const);

export const DAYS = options([
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
] as const);
export type Day = (typeof DAYS)[number]["value"];

export const HAULIER_TYPES = options([
  ["haulier", "Haulier"],
  ["pallet_network", "Pallet network"],
  ["courier", "Courier"],
] as const);

export const HAULIER_SERVICES = options([
  ["tail_lift", "Tail lift"],
  ["timed", "Timed delivery"],
  ["two_person", "Two-person"],
  ["crane", "Crane"],
] as const);

export const MIN_UNLOAD_METHODS = options([
  ["any", "Any method"],
  ["forklift", "Forklift only"],
  ["crane", "Crane only"],
] as const);

export const PALLET_SIZES = options([
  ["quarter", "Quarter"],
  ["half", "Half"],
  ["full", "Full"],
] as const);

export const LOAD_TYPES = options([
  ["full", "Full load"],
  ["part", "Part load"],
] as const);

export const COLOUR_TAGS = options([
  ["load-1", "Blue"],
  ["load-2", "Amber"],
  ["load-3", "Green"],
  ["load-4", "Pink"],
  ["load-5", "Purple"],
  ["load-6", "Teal"],
  ["load-7", "Lime"],
  ["load-8", "Red"],
  ["load-9", "Slate"],
  ["load-10", "Orange"],
] as const);

export const COMPLIANCE_REQUIREMENTS = options([
  ["euro_6", "Euro 6 / VI engine"],
  ["caz_compliant", "Clean air zone compliant"],
  ["hgv_permit", "London HGV Safety Permit"],
] as const);
