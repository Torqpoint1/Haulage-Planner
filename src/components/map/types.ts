/** Colour keys for map features: the fixed 10-colour load palette or a status. */
export type MapColour =
  | "load-1"
  | "load-2"
  | "load-3"
  | "load-4"
  | "load-5"
  | "load-6"
  | "load-7"
  | "load-8"
  | "load-9"
  | "load-10"
  | "neutral";

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  colour: MapColour;
};

export type MapRoute = {
  id: string;
  colour: MapColour;
  points: [number, number][];
};

/** Load colours cycle through the fixed palette of 10 (10.3). */
export function loadColour(index: number): MapColour {
  return `load-${(index % 10) + 1}` as MapColour;
}

/** A pin the person can drag (or click the map) to correct a location. */
export type EditablePin = {
  lat: number;
  lng: number;
  label: string;
  onMove: (lat: number, lng: number) => void;
  /** Bump to re-centre the map on the pin, e.g. after "Reset to postcode". */
  version?: number;
};
