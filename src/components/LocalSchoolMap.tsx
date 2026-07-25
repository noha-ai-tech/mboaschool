"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const schoolIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const userIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#059669;border:3px solid white;box-shadow:0 0 0 2px rgba(5,150,105,0.4)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

type MapSchool = { id: string; name: string; city: string; lat: number; lng: number };

export default function LocalSchoolMap({
  center,
  userLocation,
  radiusKm,
  schools,
}: {
  center: { lat: number; lng: number };
  userLocation: { lat: number; lng: number } | null;
  radiusKm: number;
  schools: MapSchool[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView(
      [center.lat, center.lng],
      userLocation ? 13 : 12
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    if (userLocation) {
      L.marker([userLocation.lat, userLocation.lng], { icon: userIcon }).addTo(layer);
      L.circle([userLocation.lat, userLocation.lng], {
        radius: radiusKm * 1000,
        color: "#059669",
        fillColor: "#059669",
        fillOpacity: 0.08,
        weight: 1,
      }).addTo(layer);
    }

    schools.forEach((s) => {
      L.marker([s.lat, s.lng], { icon: schoolIcon })
        .bindPopup(`<strong>${s.name}</strong><br/>${s.city}`)
        .addTo(layer);
    });

    map.setView([center.lat, center.lng], userLocation ? 13 : 12);
  }, [center, userLocation, radiusKm, schools]);

  return <div ref={containerRef} className="w-full h-full" />;
}
