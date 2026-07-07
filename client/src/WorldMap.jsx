import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const OWNER_PALETTE = [
  "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4",
  "#46f0f0", "#f032e6", "#bcf60c", "#fabebe", "#008080",
  "#e6beff", "#9a6324", "#800000", "#aaffc3", "#808000",
  "#ffd8b1", "#000075", "#808080", "#ffe119", "#42d4f4",
];

function colorForOwner(ownerId) {
  let h = 0;
  for (let i = 0; i < ownerId.length; i++) h = (h * 31 + ownerId.charCodeAt(i)) >>> 0;
  return OWNER_PALETTE[h % OWNER_PALETTE.length];
}

export default function WorldMap({ world, countries, playerCountry, selectedId, onSelect }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!world || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {},
        layers: [],
        glyphs: undefined,
      },
      center: [10, 25],
      zoom: 1.6,
      minZoom: 1,
      maxZoom: 8,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("countries", { type: "geojson", data: world, promoteId: "id" });

      map.addLayer({
        id: "country-fill",
        type: "fill",
        source: "countries",
        paint: {
          "fill-color": "#3a4a5c",
          "fill-opacity": 0.85,
        },
      });

      map.addLayer({
        id: "country-outline",
        type: "line",
        source: "countries",
        paint: {
          "line-color": "#0d1117",
          "line-width": 0.6,
        },
      });

      map.addLayer({
        id: "country-selected-outline",
        type: "line",
        source: "countries",
        filter: ["==", ["get", "id"], "__none__"],
        paint: {
          "line-color": "#ffffff",
          "line-width": 2.5,
        },
      });

      map.on("click", "country-fill", (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) onSelect(id);
      });
      map.on("mouseenter", "country-fill", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "country-fill", () => (map.getCanvas().style.cursor = ""));

      map.__ready = true;
      map.fire("app:ready");
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !countries) return;

    const applyColors = () => {
      if (!map.getLayer("country-fill")) return;
      const matchExpr = ["match", ["get", "id"]];
      for (const c of Object.values(countries)) {
        let color = colorForOwner(c.owner);
        if (c.owner === playerCountry) color = "#2ecc71";
        matchExpr.push(c.id, color);
      }
      matchExpr.push("#3a4a5c");
      map.setPaintProperty("country-fill", "fill-color", matchExpr);
      map.setFilter("country-selected-outline", ["==", ["get", "id"], selectedId || "__none__"]);
    };

    if (map.__ready) applyColors();
    else map.once("app:ready", applyColors);
  }, [countries, playerCountry, selectedId]);

  return <div ref={mapContainer} className="world-map" />;
}
