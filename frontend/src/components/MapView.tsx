import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";
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

export default function MapView({ predictions }: { predictions: Prediction[] }) {
  const byRegion = new Map(predictions.map((item) => [item.region_id, item]));
  const byCadaster = new Map(predictions.map((item) => [item.region_id, item]));

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <MapContainer center={[33.88, 35.65]} zoom={8} scrollWheelZoom className="h-[440px] w-full">
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <GeoJSON
          data={cadasters as never}
          style={(feature) => {
            const properties = feature?.properties as RegionProps | undefined;
            const featureId = properties?.region_id ?? properties?.ACS_Code ?? "";
            const prediction = byRegion.get(featureId) ?? byCadaster.get(featureId);
            const color = prediction ? colors[prediction.risk_label] : "#94a3b8";
            return {
              color,
              fillColor: color,
              fillOpacity: prediction ? 0.28 : 0.16,
              opacity: prediction ? 0.7 : 0.45,
              weight: prediction ? 1.2 : 0.6
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
      </div>
    </div>
  );
}
