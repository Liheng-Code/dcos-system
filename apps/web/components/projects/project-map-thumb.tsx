"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const LEAFLET_CDN = "https://unpkg.com/leaflet@1.9.4/dist";

interface ProjectMapThumbProps {
  lat: number;
  lng: number;
  className?: string;
  zoom?: number;
}

/**
 * Small read-only map thumbnail for a project card. Uses the same Leaflet +
 * OpenStreetMap tile stack as LocationPicker, but renders a static, tappable
 * marker. pointer-events-none lets clicks fall through to the card underneath.
 */
export function ProjectMapThumb({ lat, lng, className, zoom = 15 }: ProjectMapThumbProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    if (!document.querySelector("#leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = `${LEAFLET_CDN}/leaflet.css`;
      document.head.appendChild(link);
    }

    let destroyed = false;

    import("leaflet").then((L) => {
      if (destroyed || !mapDivRef.current) return;

      const defaultIcon = L.icon({
        iconUrl: `${LEAFLET_CDN}/images/marker-icon.png`,
        iconRetinaUrl: `${LEAFLET_CDN}/images/marker-icon-2x.png`,
        shadowUrl: `${LEAFLET_CDN}/images/marker-shadow.png`,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });

      const map = L.map(mapDivRef.current!, {
        center: [lat, lng],
        zoom,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        tapHold: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      L.marker([lat, lng], { icon: defaultIcon }).addTo(map);

      mapRef.current = map;
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={mapDivRef}
      aria-hidden
      className={cn("pointer-events-none overflow-hidden rounded-lg border border-border bg-muted/40", className)}
    />
  );
}