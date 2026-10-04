/** Where a returnable asset can be (spec 6.11). Matches the database check on assets.status. */
export const ASSET_STATUSES = [
  { value: "at_depot", label: "At depot", tone: "neutral" },
  { value: "on_vehicle", label: "On a vehicle", tone: "info" },
  { value: "at_customer", label: "At customer", tone: "neutral" },
  { value: "lost", label: "Lost", tone: "danger" },
  { value: "retired", label: "Retired", tone: "neutral" },
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number]["value"];
