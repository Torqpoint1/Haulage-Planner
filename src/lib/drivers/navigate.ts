/**
 * "Navigate" opens the phone's own map app (spec 9.8): Apple Maps on iPhone
 * and iPad, Google Maps everywhere else. Uses the pin when there is one, so
 * the driver goes to the gate rather than the middle of the postcode.
 */
export function navigateUrl(
  site: { latitude: number | null; longitude: number | null; address: string; postcode: string },
  userAgent = "",
): string {
  const apple = /iPad|iPhone|iPod/.test(userAgent);
  const place =
    site.latitude != null && site.longitude != null
      ? `${site.latitude},${site.longitude}`
      : [site.address.replace(/\s*\n\s*/g, ", "), site.postcode].filter(Boolean).join(", ");
  const q = encodeURIComponent(place);
  return apple
    ? `https://maps.apple.com/?daddr=${q}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`;
}

/** A dialable tel: link, or null when there's no number. */
export function telUrl(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.length >= 6 ? `tel:${digits}` : null;
}
