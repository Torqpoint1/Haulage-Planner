import { describe, expect, it } from "vitest";
import { lookupPostcode } from "@/lib/services/postcodes";

const respond = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("lookupPostcode", () => {
  it("returns the location from postcodes.io", async () => {
    const result = await lookupPostcode(
      "GL5 3AA",
      respond(200, {
        status: 200,
        result: { latitude: 51.745, longitude: -2.217, admin_district: "Stroud" },
      }),
    );
    expect(result).toEqual({ latitude: 51.745, longitude: -2.217, district: "Stroud" });
  });

  it("returns null for unknown postcodes", async () => {
    expect(
      await lookupPostcode("ZZ1 1ZZ", respond(404, { status: 404, error: "Postcode not found" })),
    ).toBeNull();
  });

  it("never throws when the service is down", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await lookupPostcode("GL5 3AA", down)).toBeNull();
  });
});
