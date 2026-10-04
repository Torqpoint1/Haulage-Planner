/**
 * Driver phone view and proof of delivery (spec 6.10, 9.8). Plain data, safe
 * to pass to the browser and to keep in the phone's offline cache.
 */

/** Why a delivery failed. Matches the database check on pods.failure_reason. */
export const FAILURE_REASONS = [
  { value: "site_closed", label: "Site closed" },
  { value: "no_one_to_receive", label: "No one to receive it" },
  { value: "refused", label: "Refused by the customer" },
  { value: "no_access", label: "Couldn't get access" },
  { value: "wrong_address", label: "Wrong or unclear address" },
  { value: "damaged", label: "Goods damaged" },
  { value: "not_ready", label: "Customer not ready" },
  { value: "out_of_time", label: "Ran out of time" },
  { value: "vehicle_problem", label: "Vehicle problem" },
  { value: "other", label: "Other" },
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number]["value"];

export const OUTCOMES = [
  { value: "delivered", label: "Delivered", tone: "success" },
  { value: "part_delivered", label: "Part delivered", tone: "warning" },
  { value: "failed", label: "Failed", tone: "danger" },
] as const;
export type Outcome = (typeof OUTCOMES)[number]["value"];

export const MAX_PHOTOS = 6;

export type RunLine = {
  id: string;
  quantity: number;
  description: string;
  unitName: string;
  unitCode: string;
  handling: string[];
};

export type RunOrder = {
  id: string;
  order_ref: string;
  customer_name: string;
  customer_po: string;
  delivery_note_number: string;
  lines: RunLine[];
};

export type PodSummary = {
  outcome: Outcome;
  receivedBy: string;
  failureReason: FailureReason | null;
  note: string;
  recordedAt: string;
};

export type RunStop = {
  id: string;
  sequence: number;
  status: "pending" | Outcome;
  site: {
    name: string;
    address: string;
    postcode: string;
    latitude: number | null;
    longitude: number | null;
  };
  customers: string[];
  eta: string | null;
  bookingRef: string;
  bookingSlot: string | null;
  etaFrom: string | null;
  etaTo: string | null;
  contacts: { name: string; phone: string }[];
  /** Site and order delivery instructions, without repeats. */
  instructions: string[];
  /** Access and site rules the driver needs: parking, narrow access, PPE… */
  siteNotes: string[];
  /** Handling notes across everything for this stop. */
  handling: string[];
  orders: RunOrder[];
  /** Returnable assets: drops go off with the delivery, collections come back. */
  assets: { id: string; label: string; direction: "drop" | "collect" }[];
  pod: PodSummary | null;
};

export type RunLoad = {
  id: string;
  title: string;
  subtitle: string;
  status: "planned" | "confirmed" | "loading" | "out" | "complete";
  startTime: string;
  crew: number;
  depot: { name: string; postcode: string } | null;
  notes: string;
  stops: RunStop[];
};

export type DriverRun = {
  date: string;
  /** Null when the signed-in user isn't linked to a driver. */
  driver: { id: string; name: string } | null;
  /** Admins can look at any driver's run. */
  drivers: { id: string; name: string }[] | null;
  loads: RunLoad[];
};
