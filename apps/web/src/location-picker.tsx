import { tokenColor } from "./visual-tokens";
import { useEffect, useRef, useState } from "react";
import type * as MapLibre from "maplibre-gl";
import { api } from "./api";
export function LocationPicker({
  latitude,
  longitude,
  onPick,
}: {
  latitude: string;
  longitude: string;
  onPick: (latitude: number, longitude: number, address?: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const node = useRef<HTMLDivElement>(null),
    map = useRef<MapLibre.Map | null>(null),
    marker = useRef<MapLibre.Marker | null>(null),
    pick = useRef(onPick);
  pick.current = onPick;
  useEffect(() => {
    if (!open || !node.current) return;
    let cancelled = false;
    void api("/locations/map/style")
      .then(async (style) => {
        const lib = await import("maplibre-gl");
        if (cancelled || !node.current) return;
        map.current = new lib.Map({
          container: node.current,
          style,
          center: [0, 0],
          zoom: 1,
          transformRequest: (url) => ({ url, credentials: "include" }),
        });
        marker.current = new lib.Marker({
          color: tokenColor("accent"),
          draggable: true,
        });
        const select = (lat: number, lon: number) => {
          marker.current!.setLngLat([lon, lat]).addTo(map.current!);
          pick.current(lat, ((((lon + 180) % 360) + 360) % 360) - 180);
        };
        map.current.on("click", (e) => select(e.lngLat.lat, e.lngLat.lng));
        marker.current.on("dragend", () => {
          const p = marker.current!.getLngLat();
          pick.current(p.lat, p.lng);
        });
        map.current.on("error", () =>
          setError(
            "Map tiles unavailable. GPS and manual coordinates remain available.",
          ),
        );
        if (
          latitude !== "" &&
          longitude !== "" &&
          Number.isFinite(Number(latitude)) &&
          Number.isFinite(Number(longitude)) &&
          Math.abs(Number(latitude)) <= 90 &&
          Math.abs(Number(longitude)) <= 180
        ) {
          marker.current
            .setLngLat([Number(longitude), Number(latitude)])
            .addTo(map.current);
          map.current.jumpTo({
            center: [Number(longitude), Number(latitude)],
            zoom: 14,
          });
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // Coordinates are synchronized separately to keep the map alive while dragging.
  }, [open]);
  useEffect(() => {
    if (
      map.current &&
      marker.current &&
      latitude !== "" &&
      longitude !== "" &&
      Number.isFinite(Number(latitude)) &&
      Number.isFinite(Number(longitude)) &&
      Math.abs(Number(latitude)) <= 90 &&
      Math.abs(Number(longitude)) <= 180
    ) {
      marker.current
        .setLngLat([Number(longitude), Number(latitude)])
        .addTo(map.current);
      map.current.easeTo({
        center: [Number(longitude), Number(latitude)],
        zoom: Math.max(map.current.getZoom(), 14),
      });
    }
  }, [latitude, longitude]);
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)}>
        {open
          ? "Hide map and address search"
          : "Choose on map or search address"}
      </button>
      {open && (
        <>
          <label>
            Search address
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={200}
            />
          </label>
          <button
            type="button"
            disabled={busy || query.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setResults(
                  (
                    await api(
                      `/locations/search?q=${encodeURIComponent(query)}`,
                    )
                  ).items,
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Searching…" : "Find address"}
          </button>
          {results.map((r, i) => (
            <button
              type="button"
              key={i}
              onClick={() => {
                onPick(r.latitude, r.longitude, r.label);
                setResults([]);
              }}
            >
              {r.label}
            </button>
          ))}
          {error && (
            <p role="status" className="notice">
              {error}
            </p>
          )}
          <div
            ref={node}
            className="map"
            aria-label="Click map to choose the incident location"
          />
          <p>
            Check the selected location. Search results are suggestions; you can
            correct the pin or enter coordinates manually.
          </p>
        </>
      )}
    </div>
  );
}
