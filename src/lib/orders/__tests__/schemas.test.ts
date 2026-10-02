import { describe, expect, it } from "vitest";
import { parseOrder } from "@/lib/orders/schemas";
import { unitsSummary, totalWeightKg } from "@/lib/orders/summary";

const C = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-8222-222222222222";
const U = "33333333-3333-4333-8333-333333333333";

const base = {
  customer_id: C,
  site_id: S,
  order_ref: " SO-1 ",
  required_date: "2026-10-12",
  urgency: "standard",
  readiness: "ready",
  line_0_unit_type_id: U,
  line_0_quantity: "6",
  line_0_weight_per_unit_kg: "140",
};

describe("parseOrder", () => {
  it("parses an order and its lines, ignoring empty line rows", () => {
    const r = parseOrder({
      ...base,
      line_1_unit_type_id: "none",
      line_1_quantity: "",
      line_1_description: "",
    });
    expect(r.ok && r.data).toMatchObject({
      order: { order_ref: "SO-1", readiness: "ready", expected_ready_date: null },
      lines: [{ unit_type_id: U, quantity: 6, weight_per_unit_kg: 140, description: "" }],
    });
  });

  it("needs at least one line and sensible line values", () => {
    const none = parseOrder({
      ...base,
      line_0_unit_type_id: "",
      line_0_quantity: "",
      line_0_weight_per_unit_kg: "",
    });
    expect(!none.ok && none.errors.lines).toBe("Add at least one line: what's being delivered.");
    const bad = parseOrder({ ...base, line_0_quantity: "0", line_0_weight_per_unit_kg: "x" });
    expect(!bad.ok && bad.errors).toMatchObject({
      line_0_quantity: "Enter a whole number from 1 to 10,000.",
      line_0_weight_per_unit_kg: "Enter the weight per unit in kg.",
    });
  });

  it("checks the date window and asks when unready orders will be ready", () => {
    const r = parseOrder({
      ...base,
      readiness: "part_ready",
      earliest_date: "2026-10-20",
      latest_date: "2026-10-01",
    });
    expect(!r.ok && r.errors).toMatchObject({
      earliest_date: "The earliest date can't be after the required date.",
      latest_date: "The latest date can't be before the required date.",
      expected_ready_date: "Enter when it's expected to be ready.",
    });
  });

  it("requires a customer and site", () => {
    const r = parseOrder({ ...base, customer_id: "", site_id: "none" });
    expect(!r.ok && r.errors).toMatchObject({
      customer_id: "Choose the customer.",
      site_id: "Choose the delivery site.",
    });
  });
});

describe("order summaries", () => {
  const lines = [
    { quantity: 6, weight_per_unit_kg: 140, unit_type: { short_code: "DP", name: "Door pack" } },
    { quantity: 2, weight_per_unit_kg: 300, unit_type: { short_code: "EUR", name: "Euro pallet" } },
    { quantity: 1, weight_per_unit_kg: 140, unit_type: { short_code: "DP", name: "Door pack" } },
  ];
  it("groups units by type and totals weight", () => {
    expect(unitsSummary(lines)).toBe("7 DP · 2 EUR");
    expect(totalWeightKg(lines)).toBe(1580);
  });
});
