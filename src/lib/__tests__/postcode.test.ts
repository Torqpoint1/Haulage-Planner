import { describe, expect, it } from "vitest";
import {
  normalisePostcode,
  parseAreas,
  parseAreasOrDistricts,
  postcodeArea,
  postcodeDistrict,
} from "@/lib/postcode";

describe("postcodes", () => {
  it("normalises valid postcodes", () => {
    expect(normalisePostcode("gl53aa")).toBe("GL5 3AA");
    expect(normalisePostcode("  sw1a   1aa ")).toBe("SW1A 1AA");
    expect(normalisePostcode("B1 1AA")).toBe("B1 1AA");
    expect(normalisePostcode("EC1A1BB")).toBe("EC1A 1BB");
  });

  it("rejects invalid ones", () => {
    for (const bad of ["", "GL5", "12345", "GL5 3A", "GLL5 3AA"]) {
      expect(normalisePostcode(bad), bad).toBeNull();
    }
  });

  it("finds area and district", () => {
    expect(postcodeArea("GL5 3AA")).toBe("GL");
    expect(postcodeArea("B1 1AA")).toBe("B");
    expect(postcodeDistrict("gl53aa")).toBe("GL5");
  });

  it("parses typed area lists", () => {
    expect(parseAreas("gl, np sn;GL")).toEqual({ areas: ["GL", "NP", "SN"], invalid: [] });
    expect(parseAreas("GL5 NP")).toEqual({ areas: ["NP"], invalid: ["GL5"] });
    expect(parseAreasOrDistricts("iv pa20 ZE 1x")).toEqual({
      values: ["IV", "PA20", "ZE"],
      invalid: ["1X"],
    });
  });
});
