import { describe, expect, it } from "vitest";
import { lateDelivery } from "../checks/late-delivery";
import { notConfirmed } from "../checks/not-confirmed";
import { orderNotReady } from "../checks/order-not-ready";
import { orderPartReady } from "../checks/order-part-ready";
import { context, order, stop, type ContextOverrides } from "./fixtures";

const withOrder = (over: Parameters<typeof order>[0]) =>
  context({ stops: [stop({ orders: [order({ order_ref: "SO-7", ...over })] })] });

describe("ORDER_NOT_READY", () => {
  it("blocks when the load goes before the expected ready date, offering both fixes", () => {
    const [w] = orderNotReady(
      withOrder({ readiness: "in_production", expected_ready_date: "2026-10-08" }),
    );
    expect(w).toMatchObject({
      severity: "blocking",
      entity: { type: "order" },
      title: "SO-7 won't be ready",
    });
    expect(w.detail).toBe(
      "SO-7 is in production and expected ready on 08/10/2026, after this load goes on 06/10/2026.",
    );
    expect(w.fixes.map((f) => f.label)).toEqual([
      "Take SO-7 off this load",
      "Move load to 08/10/2026",
    ]);
  });

  it("blocks when there's no expected ready date", () => {
    expect(orderNotReady(withOrder({ readiness: "not_started" }))[0].detail).toContain(
      "no expected ready date",
    );
  });

  it("passes when ready, or ready by the load date", () => {
    expect(orderNotReady(withOrder({ readiness: "ready" }))).toEqual([]);
    expect(
      orderNotReady(withOrder({ readiness: "in_production", expected_ready_date: "2026-10-06" })),
    ).toEqual([]);
  });
});

describe("ORDER_PART_READY", () => {
  it("is a check naming the missing items", () => {
    const [w] = orderPartReady(
      withOrder({
        readiness: "part_ready",
        missing_items: "2 door frames",
        expected_ready_date: "2026-10-05",
      }),
    );
    expect(w).toMatchObject({ severity: "check", detail: "SO-7 is still missing 2 door frames." });
  });

  it("still makes sense with no note, and ignores other readiness", () => {
    expect(orderPartReady(withOrder({ readiness: "part_ready" }))[0].detail).toBe(
      "SO-7 isn't all ready yet.",
    );
    expect(
      orderPartReady(withOrder({ readiness: "in_production", expected_ready_date: "2026-10-01" })),
    ).toEqual([]);
  });
});

describe("LATE_DELIVERY", () => {
  it("is a check when the load goes after the required date", () => {
    const [w] = lateDelivery(withOrder({ required_date: "2026-10-05" }));
    expect(w).toMatchObject({
      severity: "check",
      detail: "SO-7 is needed on 05/10/2026; this load goes on 06/10/2026.",
    });
  });

  it("allows up to the latest date when there is one", () => {
    expect(
      lateDelivery(withOrder({ required_date: "2026-10-05", latest_date: "2026-10-06" })),
    ).toEqual([]);
    expect(
      lateDelivery(withOrder({ required_date: "2026-10-01", latest_date: "2026-10-05" }))[0].detail,
    ).toContain("by 05/10/2026 at the latest");
  });

  it("passes on the required date itself and when early", () => {
    expect(lateDelivery(withOrder({ required_date: "2026-10-06" }))).toEqual([]);
    expect(lateDelivery(withOrder({ required_date: "2026-10-09" }))).toEqual([]);
  });
});

describe("NOT_CONFIRMED", () => {
  const unconfirmed = (loadDate: string, over: ContextOverrides = {}) =>
    context({
      ...over,
      load: { load_date: loadDate, ...over.load },
      stops: [stop({ confirmed: false })],
    });

  it("is a check within two days of delivery", () => {
    const [w] = notConfirmed(unconfirmed("2026-10-02"));
    expect(w).toMatchObject({ severity: "check", detail: expect.stringContaining("is tomorrow") });
    expect(w.fixes[0]).toMatchObject({
      id: "edit-stop",
      label: "Record confirmation",
      params: { field: "confirmation" },
    });
    expect(notConfirmed(unconfirmed("2026-10-03"))[0].detail).toContain("in 2 days");
    expect(notConfirmed(unconfirmed("2026-10-01"))[0].detail).toContain("is today");
  });

  it("passes when further away, confirmed, or already out", () => {
    expect(notConfirmed(unconfirmed("2026-10-04"))).toEqual([]);
    expect(notConfirmed(context({ load: { load_date: "2026-10-02" } }))).toEqual([]);
    expect(notConfirmed(unconfirmed("2026-10-02", { load: { status: "out" } }))).toEqual([]);
  });

  it("follows the organisation's setting", () => {
    const ctx = unconfirmed("2026-10-02");
    ctx.thresholds.not_confirmed_days = 0;
    expect(notConfirmed(ctx)).toEqual([]);
  });
});
