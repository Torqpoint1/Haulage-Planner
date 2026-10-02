import type { OpeningHours } from "@/lib/settings/schemas";
import type { SiteRules } from "./sites";

export type Customer = {
  id: string;
  name: string;
  account_ref: string;
  default_delivery_instructions: string;
  notes: string;
};

export type Site = SiteRules & {
  id: string;
  customer_id: string;
  name: string;
  address: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  location_source: "postcode" | "manual" | null;
  parking_note: string;
  how_to_book: string;
  opening_hours: OpeningHours;
  delivery_windows: OpeningHours;
  last_verified_at: string | null;
  verified_by: string | null;
  delivery_instructions: string;
  notes: string;
};

export type Contact = {
  id: string;
  customer_id: string;
  site_id: string | null;
  name: string;
  job_role: string;
  phone: string;
  email: string;
};
