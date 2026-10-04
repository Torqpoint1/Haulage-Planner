import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import { suggestFieldMapping } from "@/lib/import/mapping";
import { planVehicleImport, VEHICLE_IMPORT_FIELDS } from "../import";

const HEADER =
  "Name,Reg,Type,Owned or hired,Deck length,Deck width,Deck height,Payload,GVW,Overall length,Unloading,Tail lift max (kg),Crew,CAZ,Cost per mile";
const plan = (rows: string[], existing: string[] = ["KX19 ABC"]) => {
  const table = parseCsv([HEADER, ...rows].join("\n"));
  return planVehicleImport(
    table,
    suggestFieldMapping(VEHICLE_IMPORT_FIELDS, table.headers),
    existing,
  );
};

describe("planVehicleImport", () => {
  it("reads spreadsheet-style values into vehicles", () => {
    const p = plan([
      `18t 2,ab12 cde,18 tonne,Hired,"7,300",2480,2500,9500 kg,18000,9.8,"Tail lift, side",1000,2,yes,£0.85`,
      "Van 3,XY70VAN,van,,3400,1750,1900,1200,3500,5.9,rear,,,,",
    ]);
    expect(p.rejected).toEqual([]);
    expect(p.vehicles).toHaveLength(2);
    expect(p.vehicles[0]).toMatchObject({
      registration: "AB12 CDE",
      vehicle_type: "18t",
      ownership: "hired",
      deck_length_mm: 7300,
      payload_kg: 9500,
      unload_methods: ["tail_lift", "side"],
      tail_lift_max_kg: 1000,
      crew_size_default: 2,
      caz_compliant: true,
      cost_per_mile: 0.85,
      active: true,
    });
    expect(p.vehicles[1]).toMatchObject({
      vehicle_type: "van",
      ownership: "owned",
      unload_methods: ["rear"],
      crew_size_default: 1,
      cost_per_mile: 0,
    });
  });

  it("explains each problem against the spreadsheet row", () => {
    const p = plan([
      "Truck,KX19 ABC,18t,,7300,2480,2500,9500,18000,9.8,,,,,",
      "Lorry,LL11 AAA,juggernaut,,7300,2480,2500,9500,18000,9.8,winch,,,,",
      "Small,SM11 AAA,van,,3400,1750,1900,4000,3500,5.9,tail lift,,,maybe,",
      "A,DU11 PPP,van,,3400,1750,1900,1200,3500,5.9,,,,,",
      "B,du11ppp,van,,3400,1750,1900,1200,3500,5.9,,,,,",
    ]);
    expect(p.vehicles).toHaveLength(1);
    expect(p.rejected.map((r) => [r.row, r.ref])).toEqual([
      [2, "KX19 ABC"],
      [3, "LL11 AAA"],
      [4, "SM11 AAA"],
      [6, "du11ppp"],
    ]);
    expect(p.rejected[0].errors).toEqual(["KX19 ABC is already in your fleet."]);
    expect(p.rejected[1].errors[0]).toMatch(/“juggernaut” isn't a vehicle type/);
    expect(p.rejected[1].errors[1]).toMatch(/Unloading “winch” isn't recognised/);
    expect(p.rejected[2].errors).toEqual(
      expect.arrayContaining([
        "Clean air zone compliant should be yes or no, not “maybe”.",
        "Gross weight can't be less than the payload.",
        "Enter the tail lift's maximum lift.",
      ]),
    );
    expect(p.rejected[3].errors).toEqual(["du11ppp is listed twice."]);
  });
});
