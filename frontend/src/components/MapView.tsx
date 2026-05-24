import { useEffect, useMemo } from "react";
import L from "leaflet";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import cadasters from "../data/cadasters.json";
import type { Prediction, RiskLabel } from "../types";

const colors: Record<RiskLabel, string> = {
  Low: "#287b53",
  Medium: "#d98c20",
  High: "#c94132"
};

type RegionProps = {
  region_id?: string;
  region_name?: string;
  ACS_Code?: string;
  Cadaster?: string;
  name?: string;
};

type MapViewProps = {
  predictions: Prediction[];
  selectedRegionId: string | null;
  onSelectRegion: (regionId: string) => void;
};

export default function MapView({ predictions, selectedRegionId, onSelectRegion }: MapViewProps) {
  const byRegion = new Map(predictions.map((item) => [item.region_id, item]));
  const byCadaster = new Map(predictions.map((item) => [item.region_id, item]));
  const selectedName = predictions.find((item) => item.region_id === selectedRegionId)?.region_name;

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <MapContainer center={[33.88, 35.65]} zoom={8} scrollWheelZoom className="h-[440px] w-full">
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ZoomToCadaster selectedRegionId={selectedRegionId} />
        <GeoJSON
          key={selectedRegionId ?? "no-selection"}
          data={cadasters as never}
          style={(feature) => {
            const properties = feature?.properties as RegionProps | undefined;
            const featureId = properties?.region_id ?? properties?.ACS_Code ?? "";
            const prediction = byRegion.get(featureId) ?? byCadaster.get(featureId);
            const isSelected = selectedRegionId === featureId;
            const color = prediction ? colors[prediction.risk_label] : "#94a3b8";
            return {
              color,
              fillColor: color,
              fillOpacity: isSelected ? 0.42 : prediction ? 0.28 : 0.16,
              opacity: isSelected ? 1 : prediction ? 0.7 : 0.45,
              weight: isSelected ? 3 : prediction ? 1.2 : 0.6
            };
          }}
          onEachFeature={(feature, layer) => {
            const properties = feature.properties as RegionProps;
            const featureId = properties.region_id ?? properties.ACS_Code ?? "";
            const label = properties.region_name ?? properties.Cadaster ?? properties.name ?? properties.ACS_Code ?? "Uncalculated cadaster";
            const prediction = byRegion.get(featureId) ?? byCadaster.get(featureId);
            layer.bindPopup(
              prediction
                ? `<strong>${prediction.region_name}</strong><br/>Risk: ${prediction.risk_label}<br/>7-day rainfall: ${prediction.rainfall_7d} mm<br/>${prediction.recommended_action}`
                : `<strong>${label}</strong><br/>Risk not calculated yet`
            );
            if (prediction) {
              layer.on("click", () => onSelectRegion(prediction.region_id));
            }
          }}
        />
      </MapContainer>
      <div className="flex flex-wrap gap-3 border-t border-slate-200 px-4 py-3 text-sm">
        {Object.entries(colors).map(([label, color]) => (
          <span key={label} className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: color }} />
            {label}
          </span>
        ))}
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-slate-400" />
          Uncalculated
        </span>
        {selectedName && <span className="font-medium text-river">Selected: {selectedName}</span>}
      </div>
    </div>
  );
}

function ZoomToCadaster({ selectedRegionId }: { selectedRegionId: string | null }) {
  const map = useMap();
  const selectedFeature = useMemo(() => {
    if (!selectedRegionId) return null;
    return (cadasters as { features: Array<{ properties?: RegionProps }> }).features.find((feature) => {
      const properties = feature.properties;
      return properties?.region_id === selectedRegionId || properties?.ACS_Code === selectedRegionId;
    });
  }, [selectedRegionId]);

  useEffect(() => {
    if (!selectedFeature) return;
    const bounds = L.geoJSON(selectedFeature as never).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { maxZoom: 13, padding: [32, 32] });
    }
  }, [map, selectedFeature]);

  return null;
}
