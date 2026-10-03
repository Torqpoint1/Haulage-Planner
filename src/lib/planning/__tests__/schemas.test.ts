import { describe, expect, it } from "vitest";
import { parseLoad, parseStop } from "../schemas";

const id = "11111111-1111-4111-8111-111111111111";
const base = {
  load_date: "2026-10-06",
  depot_id: id,
  assignment: `vehicle:${id}`,
  crew_size: "1",
  start_time: "07:30",
};

describe("parseLoad", () => {
  it("splits the vehicle-or-haulier choice", () => {
    expect(parseLoad(base)).toMatchObject({
      ok: true,
      data: { vehicle_id: id, haulier_id: null, driver_ids: [] },
    });
    expect(parseLoad({ ...base, assignment: `haulier:${id}` })).toMatchObject({
      ok: true,
      data: { vehicle_id: null, haulier_id: id },
    });
    expect(parseLoad({ ...base, assignment: "" })).toMatchObject({
      ok: true,
      data: { vehicle_id: null, haulier_id: null },
    });
  });

  it("explains missing or bad fields in plain English", () => {
    const result = parseLoad({ assignment: "", crew_size: "9", start_time: "7.30" });
    expect(result).toEqual({
      ok: false,
      errors: expect.objectContaining({
        load_date: "Choose the date.",
        depot_id: "Choose the depot.",
        start_time: "Enter the start time as hh:mm, e.g. 07:30.",
      }),
    });
  });

  it("doesn't let a haulier load carry our drivers", () => {
    expect(parseLoad({ ...base, assignment: `haulier:${id}`, driver_ids: id })).toMatchObject({
      ok: false,
      errors: { driver_ids: expect.stringContaining("haulier") },
    });
  });
});

describe("parseStop", () => {
  it("accepts blank optional fields and checks the arrival window", () => {
    expect(parseStop({ confirmed: "on" })).toMatchObject({
      ok: true,
      data: { confirmed: true, eta_from: null, confirmation_method: null },
    });
    expect(parseStop({ eta_from: "10:00", eta_to: "09:00" })).toMatchObject({
      ok: false,
      errors: { eta_to: expect.any(String) },
    });
    expect(parseStop({ booking_slot: "25:00" })).toMatchObject({
      ok: false,
      errors: { booking_slot: expect.stringContaining("hh:mm") },
    });
  });
});
