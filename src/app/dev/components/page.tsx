import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Gallery } from "./gallery";

export const metadata: Metadata = { title: "Component gallery", robots: { index: false } };

/**
 * Component gallery (spec 10.4): every component in every state, in light
 * and dark mode. Development only; set ENABLE_DEV_GALLERY=1 to serve it from
 * a production build (used by the Playwright screenshot run).
 */
export default async function ComponentGalleryPage() {
  await connection();
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEV_GALLERY !== "1") notFound();
  return <Gallery />;
}
