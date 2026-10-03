/**
 * Map tile provider (spec section 4). All third-party calls go through small
 * service modules like this one so providers can be swapped later.
 *
 * The public OpenStreetMap tile servers must not be used in production, so
 * there is deliberately no OSM option here. With no provider configured the
 * map still shows pins and routes on a plain background (spec 12: external
 * services failing must never stop planning).
 */

export type TileConfig = {
  url: string;
  attribution: string;
  maxZoom: number;
};

type Provider = "maptiler" | "stadia" | "none";

export function getTileConfig(theme: "light" | "dark"): TileConfig | null {
  const key = process.env.NEXT_PUBLIC_MAP_TILE_KEY;
  // MapTiler is the chosen provider (Stage 6); it's used whenever a key is set.
  const provider = (process.env.NEXT_PUBLIC_MAP_TILE_PROVIDER ||
    (key ? "maptiler" : "none")) as Provider;

  if (provider === "maptiler" && key) {
    const style = theme === "dark" ? "dataviz-dark" : "dataviz";
    return {
      url: `https://api.maptiler.com/maps/${style}/256/{z}/{x}/{y}.png?key=${key}`,
      attribution:
        '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 18,
    };
  }

  if (provider === "stadia") {
    // Stadia authenticates by domain in the browser; the key is optional.
    const style = theme === "dark" ? "alidade_smooth_dark" : "alidade_smooth";
    const suffix = key ? `?api_key=${key}` : "";
    return {
      url: `https://tiles.stadiamaps.com/tiles/${style}/{z}/{x}/{y}.png${suffix}`,
      attribution:
        '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 18,
    };
  }

  return null;
}

/** Roughly the middle of England and Wales, for an empty map. */
export const UK_CENTRE: [number, number] = [52.3, -1.9];
export const UK_ZOOM = 6;
