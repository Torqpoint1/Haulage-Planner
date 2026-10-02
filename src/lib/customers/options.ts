/** Choices for site forms; values match the database CHECK constraints. */

export const SITE_EQUIPMENT = [
  { value: "forklift", label: "Forklift" },
  { value: "moffett", label: "Moffett (truck-mounted forklift)" },
  { value: "pump_truck", label: "Pump truck" },
] as const;

export type SiteEquipment = (typeof SITE_EQUIPMENT)[number]["value"];
