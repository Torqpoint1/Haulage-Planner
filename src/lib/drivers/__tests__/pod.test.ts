import { describe, expect, it } from "vitest";
import { navigateUrl, telUrl } from "../navigate";
import { podSubmissionSchema, validatePod, type PodDraft } from "../pod";

const stop = {
  orders: [
    {
      id: "o1",
      order_ref: "SO-1",
      customer_name: "Acme",
      customer_po: "",
      delivery_note_number: "",
      lines: [
        {
          id: "a",
          quantity: 3,
          description: "",
          unitName: "Door pack",
          unitCode: "DP",
          handling: [],
        },
        {
          id: "b",
          quantity: 2,
          description: "",
          unitName: "Pallet",
          unitCode: "EUR",
          handling: [],
        },
      ],
    },
  ],
};

const signed: PodDraft = {
  outcome: "delivered",
  receivedBy: "Jo Bloggs",
  hasSignature: true,
  noSignature: false,
  photoCount: 0,
  failureReason: null,
  note: "",
  quantities: {},
};

describe("validatePod", () => {
  it("accepts a signed delivery", () => {
    expect(validatePod(signed, stop)).toEqual({});
  });

  it("needs a name and a signature, or a photo when nobody can sign", () => {
    expect(validatePod({ ...signed, receivedBy: " ", hasSignature: false }, stop)).toEqual({
      receivedBy: "Enter the name of the person who received it.",
      signature: "Get a signature, or tick that nobody can sign.",
    });
    expect(validatePod({ ...signed, hasSignature: false, noSignature: true }, stop)).toEqual({
      signature: "Take a photo to show where you left it.",
    });
    expect(
      validatePod({ ...signed, hasSignature: false, noSignature: true, photoCount: 1 }, stop),
    ).toEqual({});
  });

  it("a part delivery must be short of something, but not everything", () => {
    const part = { ...signed, outcome: "part_delivered" as const };
    expect(validatePod(part, stop).quantities).toMatch(/some, but not everything/);
    expect(validatePod({ ...part, quantities: { a: 0, b: 0 } }, stop).quantities).toMatch(
      /some, but not everything/,
    );
    expect(validatePod({ ...part, quantities: { a: 4 } }, stop).quantities).toMatch(
      /between 0 and the quantity ordered/,
    );
    expect(validatePod({ ...part, quantities: { a: 2 } }, stop)).toEqual({});
  });

  it("a failed delivery needs a reason and a note, but no name or signature", () => {
    const failed: PodDraft = { ...signed, outcome: "failed", receivedBy: "", hasSignature: false };
    expect(validatePod(failed, stop)).toEqual({
      failureReason: "Choose why the delivery failed.",
      note: "Add a note saying what happened.",
    });
    expect(
      validatePod({ ...failed, failureReason: "site_closed", note: "Gates locked" }, stop),
    ).toEqual({});
  });

  it("limits photos", () => {
    expect(validatePod({ ...signed, photoCount: 7 }, stop).photos).toMatch(/up to 6/);
  });
});

describe("podSubmissionSchema", () => {
  const base = {
    clientId: "7b0f5f8e-7d1f-4f0b-9c1e-3f3f3f3f3f3f",
    stopId: "1b0f5f8e-7d1f-4f0b-9c1e-3f3f3f3f3f3f",
    outcome: "failed",
    receivedBy: "",
    signaturePath: null,
    noSignature: false,
    photoPaths: [],
    failureReason: "refused",
    note: "Refused at the door",
    lines: [],
    recordedAt: "2026-10-12T09:15:00.000Z",
    location: null,
  };
  it("accepts a submission and rejects unknown reasons", () => {
    expect(podSubmissionSchema.safeParse(base).success).toBe(true);
    expect(podSubmissionSchema.safeParse({ ...base, failureReason: "bored" }).success).toBe(false);
  });
});

describe("navigation and calling", () => {
  const site = {
    latitude: 51.7456,
    longitude: -2.2174,
    address: "Unit 4\nMill Lane",
    postcode: "GL5 3AA",
  };
  it("opens Google Maps, or Apple Maps on an iPhone, at the pin", () => {
    expect(navigateUrl(site, "Mozilla/5.0 (Linux; Android 14)")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=51.7456%2C-2.2174&travelmode=driving",
    );
    expect(navigateUrl(site, "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(
      "https://maps.apple.com/?daddr=51.7456%2C-2.2174&dirflg=d",
    );
  });
  it("falls back to the address when there's no pin", () => {
    expect(navigateUrl({ ...site, latitude: null, longitude: null })).toContain(
      encodeURIComponent("Unit 4, Mill Lane, GL5 3AA"),
    );
  });
  it("makes tel: links only from real numbers", () => {
    expect(telUrl("07700 900123")).toBe("tel:07700900123");
    expect(telUrl("+44 (0)1453 123456")).toBe("tel:+4401453123456");
    expect(telUrl("")).toBeNull();
  });
});
