import { useEffect, useRef, useState } from "react";
import type * as MapLibre from "maplibre-gl";
import { useData } from "./hooks";
import { api, label } from "./api";
export function ResourceMap() {
  const { data, error, reload } = useData("/resource-locations");
  const node = useRef<HTMLDivElement>(null),
    [mapError, setMapError] = useState("");
  useEffect(() => {
    if (!node.current || !data?.items.length) return;
    let map: MapLibre.Map | undefined,
      cancelled = false;
    void api("/locations/map/style")
      .then(async (style) => {
        const lib = await import("maplibre-gl");
        if (cancelled || !node.current) return;
        map = new lib.Map({
          container: node.current,
          style,
          center: [data.items[0].longitude, data.items[0].latitude],
          zoom: 11,
          transformRequest: (url) => ({ url, credentials: "include" }),
        });
        const bounds = new lib.LngLatBounds();
        for (const r of data.items) {
          const point: [number, number] = [r.longitude, r.latitude];
          bounds.extend(point);
          new lib.Marker({
            color: r.status === "AVAILABLE" ? "#24564c" : "#999",
          })
            .setLngLat(point)
            .setPopup(new lib.Popup().setText(`${r.name}: ${label(r.status)}`))
            .addTo(map);
        }
        map.fitBounds(bounds, { padding: 40, maxZoom: 14 });
        map.on("error", () =>
          setMapError(
            "Map tiles unavailable. Authorized locations remain listed below.",
          ),
        );
      })
      .catch((e) => setMapError(e.message));
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [data]);
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Shelters & resource locations</h1>
          <p>
            Administrator-published sites and locations your role is authorized
            to view.
          </p>
        </div>
        <button onClick={() => void reload()}>Refresh locations</button>
      </header>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {data?.items.length ? (
        <>
          <div ref={node} className="map" />
          {mapError && <p className="notice">{mapError}</p>}
          {data.items.map((r: any) => (
            <article className="panel" key={r.id}>
              <h2>{r.name}</h2>
              <p>
                {label(r.type)} · {label(r.status)}
              </p>
              <p>{r.address}</p>
              <p>
                {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}
              </p>
              <p>
                {r.status === "AVAILABLE"
                  ? `${r.quantity - r.allocated} units currently unallocated`
                  : "Currently unavailable"}
                . Confirm access with the coordinator.
              </p>
            </article>
          ))}
        </>
      ) : (
        data && (
          <p className="empty">
            No authorized resource locations have been published.
          </p>
        )
      )}
    </>
  );
}
