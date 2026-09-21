"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import type * as LeafletTypes from "leaflet";

interface LocationPickerProps {
  lat: number | null;
  lng: number | null;
  address: string;
  radius?: number;
  onChange: (lat: number, lng: number, address: string) => void;
  /** ISO 3166-1 alpha-2 code (e.g. "kh") to bias search results to one country. */
  country?: string;
  /** Initial viewport when no lat/lng is set. Defaults to Cambodia / Phnom Penh. */
  defaultCenter?: { lat: number; lng: number; zoom: number };
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

const LEAFLET_CDN = "https://unpkg.com/leaflet@1.9.4/dist";

// Cambodia-focused defaults: Phnom Penh (11.5564, 104.9282). Zoom 7 shows the
// whole country; zoom 11 gets to the Phnom Penh / Kandal metro area.
const DEFAULT_CENTER = { lat: 11.5564, lng: 104.9282, zoom: 12 };

export function LocationPicker({ lat, lng, address, radius = 0, onChange, country, defaultCenter = DEFAULT_CENTER }: LocationPickerProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const circleRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  const radiusRef = useRef(radius);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [searchQuery, setSearchQuery] = useState(address || "");
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Update circle radius when prop changes (no-op when radius is 0/unset)
  useEffect(() => {
    radiusRef.current = radius;
    if (radius > 0) circleRef.current?.setRadius(radius);
  }, [radius]);

  async function reverseGeocode(rlat: number, rlng: number) {
    setGeocoding(true);
    try {
      const res = await fetch(`/api/geo/reverse?lat=${rlat}&lng=${rlng}`);
      const data = await res.json();
      const addr: string = data.display_name ?? "";
      onChangeRef.current(rlat, rlng, addr);
      setSearchQuery(addr);
    } catch {
      onChangeRef.current(rlat, rlng, "");
    } finally {
      setGeocoding(false);
    }
  }

  // Initialise Leaflet map once
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    // Inject Leaflet CSS via link tag (avoids Next.js SSR CSS issues)
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

      const initLat = lat ?? defaultCenter.lat;
      const initLng = lng ?? defaultCenter.lng;
      const initZoom = lat && lng ? 16 : defaultCenter.zoom;

      const map = L.map(mapDivRef.current!).setView([initLat, initLng], initZoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      function addMarkerAndCircle(mlat: number, mlng: number) {
        if (markerRef.current) {
          markerRef.current.setLatLng([mlat, mlng]);
          if (radiusRef.current > 0) circleRef.current?.setLatLng([mlat, mlng]);
        } else {
          const marker = L.marker([mlat, mlng], { icon: defaultIcon, draggable: true }).addTo(map);
          if (radiusRef.current > 0) {
            const circle = L.circle([mlat, mlng], {
              radius: radiusRef.current,
              color: "#3b82f6",
              fillColor: "#3b82f6",
              fillOpacity: 0.12,
              weight: 2,
            }).addTo(map);
            marker.on("dragend", () => {
              const pos = marker.getLatLng();
              circle.setLatLng(pos);
              reverseGeocode(pos.lat, pos.lng);
            });
            circleRef.current = circle;
          } else {
            marker.on("dragend", () => {
              const pos = marker.getLatLng();
              reverseGeocode(pos.lat, pos.lng);
            });
          }
          markerRef.current = marker;
        }
      }

      if (lat && lng) addMarkerAndCircle(lat, lng);

      map.on("click", (e: LeafletTypes.LeafletMouseEvent) => {
        addMarkerAndCircle(e.latlng.lat, e.latlng.lng);
        reverseGeocode(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = { map, defaultIcon, L, addMarkerAndCircle };
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.map.remove();
        mapRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function panToResult(rlat: number, rlng: number, addr: string) {
    const refs = mapRef.current;
    if (refs) {
      refs.map.setView([rlat, rlng], 16);
      refs.addMarkerAndCircle(rlat, rlng);
    }
    onChangeRef.current(rlat, rlng, addr);
    setSearchQuery(addr);
    setSuggestions([]);
  }

  function handleSearch(value: string) {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!value.trim()) { setSuggestions([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const cc = country ? `&country=${encodeURIComponent(country)}` : "";
        const res = await fetch(`/api/geo/search?q=${encodeURIComponent(value)}${cc}`);
        setSuggestions(await res.json());
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 500);
  }

  return (
    <div className="space-y-2">
      {/* Search */}
      <div className="relative">
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-9 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Search for a place or address…"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setSuggestions([])}
            autoComplete="off"
          />
          {searching
            ? <Loader2 className="absolute right-3 h-4 w-4 animate-spin text-muted-foreground" />
            : searchQuery && (
              <button className="absolute right-3" onClick={() => { setSearchQuery(""); setSuggestions([]); }}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )
          }
        </div>

        {/* Suggestions dropdown */}
        {suggestions.length > 0 && (
          <div className="absolute z-[9999] mt-1 w-full rounded-md border bg-background shadow-lg">
            {suggestions.map((s) => (
              <button
                key={s.place_id}
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 first:rounded-t-md last:rounded-b-md"
                onClick={() => panToResult(Number(s.lat), Number(s.lon), s.display_name)}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="line-clamp-2">{s.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="relative rounded-md overflow-hidden border">
        <div ref={mapDivRef} className="h-64 w-full" />
        {geocoding && (
          <div className="absolute top-2 right-2 z-[9998] flex items-center gap-1 rounded bg-background/90 px-2 py-1 text-xs shadow">
            <Loader2 className="h-3 w-3 animate-spin" />Getting address…
          </div>
        )}
        <div className="absolute bottom-5 left-1/2 z-[9998] -translate-x-1/2 rounded bg-background/80 px-2 py-0.5 text-xs pointer-events-none select-none">
          Click to place pin · Drag to move
        </div>
      </div>

      {lat != null && lng != null && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />
          {lat.toFixed(6)}, {lng.toFixed(6)}
        </p>
      )}
    </div>
  );
}
