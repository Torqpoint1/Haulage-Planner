"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { UK_CENTRE, UK_ZOOM, type TileConfig } from "@/lib/services/tiles";
import type { EditablePin, MapPin, MapRoute } from "./types";

type MapCanvasProps = {
  pins: MapPin[];
  routes: MapRoute[];
  tiles: TileConfig | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  editable?: EditablePin | null;
  label: string;
};

function FitToContent({
  pins,
  routes,
  editable,
}: {
  pins: MapPin[];
  routes: MapRoute[];
  editable?: EditablePin | null;
}) {
  const map = useMap();
  // An editable pin is fitted when it first appears or is reset, not while being dragged.
  const key = [
    ...pins.map((p) => `${p.lat},${p.lng}`),
    ...routes.map((r) => r.id),
    editable ? `editable:${editable.version ?? 0}` : "",
  ].join("|");
  useEffect(() => {
    const points: [number, number][] = [
      ...pins.map((p) => [p.lat, p.lng] as [number, number]),
      ...routes.flatMap((r) => r.points),
      ...(editable ? [[editable.lat, editable.lng] as [number, number]] : []),
    ];
    if (points.length === 0) {
      map.setView(UK_CENTRE, UK_ZOOM);
    } else if (points.length === 1) {
      map.setView(points[0], 11);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 12 });
    }
    // Only refit when the set of places changes, not on selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

/** Keeps Leaflet's size correct when the panel is shown, hidden or resized. */
function ResizeWatcher() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

const editIcon = L.divIcon({
  className: "map-edit-pin",
  html: '<span class="map-edit-pin-dot"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function ClickToPlace({ editable }: { editable?: EditablePin | null }) {
  const map = useMap();
  useEffect(() => {
    if (!editable) return;
    const onClick = (e: L.LeafletMouseEvent) => editable.onMove(e.latlng.lat, e.latlng.lng);
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, editable]);
  return null;
}

export default function MapCanvas({
  pins,
  routes,
  tiles,
  selectedId,
  onSelect,
  editable,
  label,
}: MapCanvasProps) {
  return (
    <MapContainer
      center={UK_CENTRE}
      zoom={UK_ZOOM}
      className="size-full"
      attributionControl={Boolean(tiles)}
      zoomControl
      aria-label={label}
    >
      {tiles ? (
        <TileLayer url={tiles.url} attribution={tiles.attribution} maxZoom={tiles.maxZoom} />
      ) : null}
      {routes.map((route) => (
        <Polyline
          key={route.id}
          positions={route.points}
          // Leaflet only reads className when the path is created, so it is a
          // direct option rather than part of pathOptions.
          className={`map-stroke-${route.colour}`}
          pathOptions={{ weight: 4, opacity: 0.85 }}
        />
      ))}
      {pins.map((pin) => {
        const selected = pin.id === selectedId;
        return (
          <CircleMarker
            key={`${pin.id}-${selected ? "on" : "off"}`}
            center={[pin.lat, pin.lng]}
            radius={selected ? 10 : 7}
            className={`map-pin map-fill-${pin.colour}${selected ? " map-pin-selected" : ""}`}
            pathOptions={{ weight: selected ? 3 : 2, fillOpacity: 1 }}
            eventHandlers={{ click: () => onSelect?.(pin.id) }}
            bubblingMouseEvents={false}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              {pin.label}
            </Tooltip>
          </CircleMarker>
        );
      })}
      {editable ? (
        <Marker
          // Leaflet sets the title once, so re-create the marker when it moves.
          key={`${editable.lat},${editable.lng}`}
          position={[editable.lat, editable.lng]}
          icon={editIcon}
          draggable
          keyboard
          title={`${editable.label}: ${editable.lat.toFixed(5)}, ${editable.lng.toFixed(5)}`}
          alt={editable.label}
          eventHandlers={{
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng();
              editable.onMove(p.lat, p.lng);
            },
          }}
        />
      ) : null}
      <ClickToPlace editable={editable} />
      <FitToContent pins={pins} routes={routes} editable={editable} />
      <ResizeWatcher />
    </MapContainer>
  );
}
