import { describe, expect, it } from "vitest";
import { parseAssetNumbers } from "../numbers";

describe("parseAssetNumbers", () => {
  it("takes one per line or comma separated", () => {
    expect(parseAssetNumbers("ST-1, ST-2\nAF 7\n\n")).toEqual({
      numbers: ["ST-1", "ST-2", "AF 7"],
      errors: [],
    });
  });

  it("expands ranges, keeping the width of the numbers", () => {
    expect(parseAssetNumbers("ST-098 to ST-102").numbers).toEqual([
      "ST-098",
      "ST-099",
      "ST-100",
      "ST-101",
      "ST-102",
    ]);
    expect(parseAssetNumbers("cage 5 to 7").numbers).toEqual(["cage 5", "cage 6", "cage 7"]);
  });

  it("explains what's wrong", () => {
    expect(parseAssetNumbers("ST-5 to ST-1").errors).toEqual([
      "“ST-5 to ST-1”: the range runs backwards.",
    ]);
    expect(parseAssetNumbers("ST-1 to AF-3").errors[0]).toMatch(/same start/);
    expect(parseAssetNumbers("ST-1, st-1").errors).toEqual(["st-1 is listed twice."]);
    expect(parseAssetNumbers("ST-1 to ST-500").errors[0]).toMatch(/more than 200/);
    expect(parseAssetNumbers("  ").errors).toEqual(["Enter at least one asset number."]);
  });
});
