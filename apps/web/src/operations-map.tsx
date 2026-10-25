import { useEffect, useRef, useState } from "react";
import type * as MapLibre from "maplibre-gl";
import { MapPin } from "lucide-react";
import { api, label } from "./api";
import { useData } from "./hooks";
import { locationState } from "../../../packages/core/src/domain";
export function OperationsMap({
  items,
  selected,
  onSelect,
}: {
  items: any[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const node = useRef<HTMLDivElement>(null),
    map = useRef<MapLibre.Map | null>(null);
  const [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [retry, setRetry] = useState(0);
  const resources = useData("/resource-locations");
  const selection = useRef(onSelect);
  selection.current = onSelect;
  const markers = useRef<MapLibre.Marker[]>([]);
  const lastFit = useRef("");
  useEffect(() => {
    let cancelled = false;
    setError("");
    setReady(false);
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
        map.current.addControl(new lib.NavigationControl(), "top-right");
        map.current.on("load", () => setReady(true));
        map.current.on("error", () =>
          setError(
            "Map service unavailable. Use the authorized incident list and coordinates below.",
          ),
        );
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [retry]);
  useEffect(() => {
    if (!ready || !map.current) return;
    let cancelled = false;
    void import("maplibre-gl").then((lib) => {
      if (cancelled || !map.current) return;
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      const bounds = new lib.LngLatBounds();
      for (const i of items) {
        if (!Number.isFinite(i.latitude) || !Number.isFinite(i.longitude))
          continue;
        const el = document.createElement("button");
        el.className = `map-pin ${i.severity.toLowerCase()} ${selected === i.id ? "selected" : ""}`;
        el.type = "button";
        el.textContent = i.severity === "CRITICAL" ? "!" : "•";
        el.setAttribute(
          "aria-label",
          `${label(i.category)}, ${label(i.severity)}, ${i.id.slice(0, 8)}`,
        );
        el.addEventListener("click", () => selection.current(i.id));
        const point: [number, number] = [i.longitude, i.latitude];
        bounds.extend(point);
        markers.current.push(
          new lib.Marker({ element: el }).setLngLat(point).addTo(map.current),
        );
      }
      for (const r of resources.data?.items ?? []) {
        markers.current.push(
          new lib.Marker({ color: "#15755a", scale: 0.7 })
            .setLngLat([r.longitude, r.latitude])
            .setPopup(new lib.Popup().setText(`${r.name} · ${label(r.status)}`))
            .addTo(map.current),
        );
      }
      const signature = items.map((i) => i.id).join(",");
      if (!bounds.isEmpty() && signature !== lastFit.current) {
        map.current.fitBounds(bounds, {
          padding: 55,
          maxZoom: 14,
          duration: 0,
        });
        lastFit.current = signature;
      }
      const focused = items.find((i) => i.id === selected);
      if (focused)
        map.current.easeTo({
          center: [focused.longitude, focused.latitude],
          duration: 0,
        });
    });
    return () => {
      cancelled = true;
    };
  }, [items, ready, selected, resources.data]);
  useEffect(() => {
    if (!selected || !ready || !map.current) return;
    let cancelled = false;
    const activeMarkers: MapLibre.Marker[] = [];
    void api(`/locations/incidents/${selected}`)
      .then(async (data) => {
        const lib = await import("maplibre-gl");
        if (cancelled || !map.current) return;
        for (const team of data.teams ?? []) {
          if (
            !team.location_at ||
            locationState(team.location_at, team.accuracy) !== "LIVE"
          )
            continue;
          activeMarkers.push(
            new lib.Marker({ color: "#2563eb" })
              .setLngLat([team.longitude, team.latitude])
              .setPopup(
                new lib.Popup().setText(
                  `${team.name} · observed ${new Date(team.location_at).toLocaleTimeString()}`,
                ),
              )
              .addTo(map.current),
          );
        }
      })
      .catch(() => {});
    // Remove snapshot markers on refresh; never represent an old observation as live.
    const timer = window.setTimeout(
      () => activeMarkers.forEach((m) => m.remove()),
      5000,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      activeMarkers.forEach((m) => m.remove());
    };
  }, [selected, ready, items]);
  return (
    <section className="ops-map panel" aria-label="Operational incident map">
      <div className="section-heading">
        <h2>
          <MapPin size={18} /> Incident map
        </h2>
        <span className="muted">Authorized locations only</span>
      </div>
      <div className="map-stage">
        <div ref={node} className="map" />
        {(error || !ready) && (
          <div className="map-state">
            <MapPin size={30} />
            <strong>{error ? "Map unavailable" : "Loading map…"}</strong>
            <p>{error || "Connecting to the configured map provider."}</p>
            {error && (
              <button onClick={() => setRetry((n) => n + 1)}>Retry map</button>
            )}
          </div>
        )}
      </div>
      <p className="map-legend">
        <span>Red: critical</span>
        <span>Amber: high</span>
        <span>Blue: current assigned responder</span>
        <span>Green: authorized resource</span>
      </p>
      {!items.length && (
        <p className="muted">
          No matching incident locations. Adjust filters or wait for a new
          report.
        </p>
      )}
    </section>
  );
}
