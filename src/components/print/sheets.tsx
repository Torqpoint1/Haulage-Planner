import { formatMiles } from "@/lib/format";
import type { SheetLoad } from "@/lib/warehouse/data";

/** Pick sheet: load order, last drop first, with boxes to tick (spec 9.5). */
export function PickSheetPrint({ load }: { load: SheetLoad }) {
  return (
    <>
      <p className="print-note">Load in this order: the last drop goes on first.</p>
      {load.sections.map((section) => (
        <section
          key={section.stop.id}
          className="print-section"
          aria-label={`Load ${section.loadPosition}: ${section.stop.site.name}`}
        >
          <h2>
            <span className="pos">{section.loadPosition}</span>
            <span>
              {section.stop.site.name}, {section.stop.site.postcode}
            </span>
          </h2>
          <p className="sub">
            {section.loadPosition === 1
              ? "Load first"
              : `Load ${section.loadPosition} of ${load.stops.length}`}{" "}
            · drop {section.dropNumber} of {load.stops.length}
            {section.isLastDrop ? " (last drop)" : ""}
          </p>
          <table className="print-table">
            <thead>
              <tr>
                <th className="tick">Picked</th>
                <th className="tick">Loaded</th>
                <th className="qty">Qty</th>
                <th>Item</th>
                <th>Order</th>
                <th>Handling and securing</th>
              </tr>
            </thead>
            <tbody>
              {section.orders.flatMap((o) =>
                o.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="tick">
                      <span className="box" aria-label={l.pick.picked ? "Picked" : "Not picked"}>
                        {l.pick.picked ? "✓" : ""}
                      </span>
                    </td>
                    <td className="tick">
                      <span className="box" aria-label={l.pick.loaded ? "Loaded" : "Not loaded"}>
                        {l.pick.loaded ? "✓" : ""}
                      </span>
                    </td>
                    <td className="qty">{l.quantity}</td>
                    <td>
                      <strong>{l.unitName}</strong> ({l.unitCode})
                      {l.description ? <div>{l.description}</div> : null}
                      {l.pick.shortage ? (
                        <div>
                          <strong>Shortage:</strong> {l.pick.shortage_note}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <strong>{o.order_ref}</strong>
                      <div>{o.customer_name}</div>
                    </td>
                    <td>
                      {l.handling.join(" · ")}
                      {l.securing ? <div>Securing: {l.securing}</div> : null}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          <AssetLines assets={load.stops.find((x) => x.id === section.stop.id)?.assets ?? []} />
        </section>
      ))}
    </>
  );
}

/** Returnable assets on a stop, for the paper sheets. */
function AssetLines({ assets }: { assets: SheetLoad["stops"][number]["assets"] }) {
  const drops = assets.filter((a) => a.direction === "drop").map((a) => a.label);
  const collects = assets.filter((a) => a.direction === "collect").map((a) => a.label);
  if (!drops.length && !collects.length) return null;
  return (
    <p className="print-assets">
      {drops.length ? (
        <>
          <strong>Returnable assets to send:</strong> {drops.join(", ")}.{" "}
        </>
      ) : null}
      {collects.length ? (
        <>
          <strong>Collect:</strong> {collects.join(", ")}.
        </>
      ) : null}
    </p>
  );
}

const unitsOf = (load: SheetLoad, stopId: string) => {
  const lines =
    load.sections.find((s) => s.stop.id === stopId)?.orders.flatMap((o) => o.lines) ?? [];
  return lines;
};

/** Driver run sheet: drops in order with everything needed at each stop. */
export function RunSheetPrint({ load }: { load: SheetLoad }) {
  return (
    <>
      <p className="print-note">
        {load.stops.length} {load.stops.length === 1 ? "drop" : "drops"}
        {load.depot ? ` · leave ${load.depot.name} at ${load.startTime}` : ""}
        {load.miles != null
          ? ` · about ${formatMiles(load.miles)}${load.roadDistances ? "" : " (estimate)"}`
          : ""}
      </p>
      {load.stops.map((stop) => {
        const lines = unitsOf(load, stop.id);
        const notes = [
          ...new Set(
            lines.flatMap((l) =>
              l.handling.filter(
                (h) => h !== "Don't stack" && h !== "Can be stacked" && !h.startsWith("Stack"),
              ),
            ),
          ),
        ];
        return (
          <section
            key={stop.id}
            className="print-section"
            aria-label={`Drop ${stop.sequence}: ${stop.site.name}`}
          >
            <h2>
              <span className="pos">{stop.sequence}</span>
              <span>{stop.site.name}</span>
            </h2>
            <dl className="print-detail">
              <dt>Address</dt>
              <dd>{[stop.site.address, stop.site.postcode].filter(Boolean).join(", ")}</dd>
              <dt>{stop.etaPlanned ? "Arrive" : "Arrive (est.)"}</dt>
              <dd>{stop.eta ?? "Not known"}</dd>
              {stop.bookingRef || stop.bookingSlot ? (
                <>
                  <dt>Booking</dt>
                  <dd>
                    {stop.bookingRef || "No reference"}
                    {stop.bookingSlot ? ` at ${stop.bookingSlot}` : ""}
                  </dd>
                </>
              ) : null}
              {stop.contacts.length ? (
                <>
                  <dt>Contact</dt>
                  <dd>
                    {stop.contacts
                      .map((c) => `${c.name}${c.phone ? ` ${c.phone}` : ""}`)
                      .join("; ")}
                  </dd>
                </>
              ) : null}
              {stop.instructions.length ? (
                <>
                  <dt>Instructions</dt>
                  <dd>{stop.instructions.join(" ")}</dd>
                </>
              ) : null}
              {notes.length ? (
                <>
                  <dt>Handling</dt>
                  <dd>{notes.join(" · ")}</dd>
                </>
              ) : null}
            </dl>
            <table className="print-table">
              <thead>
                <tr>
                  <th style={{ width: "28mm" }}>Order</th>
                  <th className="qty">Qty</th>
                  <th>Item</th>
                </tr>
              </thead>
              <tbody>
                {stop.orders.flatMap((o) =>
                  o.lines.map((l, i) => {
                    const line = lines.find((x) => x.id === l.id);
                    return (
                      <tr key={l.id}>
                        <td>{i === 0 ? <strong>{o.order_ref}</strong> : null}</td>
                        <td className="qty">{l.quantity}</td>
                        <td>
                          {line?.unitName ?? "Item"}
                          {l.description ? ` · ${l.description}` : ""}
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
            <AssetLines assets={stop.assets} />
            <div className="print-sign">
              <div>Received by (name)</div>
              <div>Signature</div>
              <div>Time</div>
            </div>
          </section>
        );
      })}
    </>
  );
}

/** Delivery notes: one per drop, for the customer to sign (spec 10.8). */
export function DeliveryNotesPrint({ load }: { load: SheetLoad }) {
  return (
    <>
      {load.stops.map((stop) => (
        <section
          key={stop.id}
          className="print-section page"
          aria-label={`Delivery note: ${stop.site.name}`}
        >
          <h2>
            <span className="pos">{stop.sequence}</span>
            <span>Delivery to {stop.orders[0]?.customer_name ?? stop.site.name}</span>
          </h2>
          <dl className="print-detail">
            <dt>Deliver to</dt>
            <dd>
              {[stop.site.name, stop.site.address, stop.site.postcode].filter(Boolean).join(", ")}
            </dd>
            <dt>Orders</dt>
            <dd>
              {stop.orders
                .map((o) =>
                  [
                    o.order_ref,
                    o.customer_po && `PO ${o.customer_po}`,
                    o.delivery_note_number && `DN ${o.delivery_note_number}`,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                )
                .join("; ")}
            </dd>
          </dl>
          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width: "28mm" }}>Order</th>
                <th className="qty">Qty</th>
                <th>Item</th>
                <th className="tick">Received</th>
              </tr>
            </thead>
            <tbody>
              {stop.orders.flatMap((o) =>
                o.lines.map((l, i) => {
                  const line = unitsOf(load, stop.id).find((x) => x.id === l.id);
                  return (
                    <tr key={l.id}>
                      <td>{i === 0 ? <strong>{o.order_ref}</strong> : null}</td>
                      <td className="qty">{l.quantity}</td>
                      <td>
                        {line?.unitName ?? "Item"}
                        {l.description ? ` · ${l.description}` : ""}
                      </td>
                      <td className="tick">
                        <span className="box" />
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
          <AssetLines assets={stop.assets} />
          <p className="sub" style={{ marginTop: "4mm" }}>
            Received in good condition, except as noted:
          </p>
          <div className="print-sign" style={{ gridTemplateColumns: "1fr" }}>
            <div>Notes</div>
          </div>
          <div className="print-sign">
            <div>Name</div>
            <div>Signature</div>
            <div>Date and time</div>
          </div>
        </section>
      ))}
    </>
  );
}
