import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";
import regions from "../data/regions";
import type { Prediction, RiskLabel } from "../types";

const colors: Record<RiskLabel, string> = {
  Low: "#287b53",
  Medium: "#d98c20",
  High: "#c94132"
};

type RegionProps = {
  region_id: string;
  region_name: string;
};

export default function MapView({ predictions }: { predictions: Prediction[] }) {
  const byRegion = new Map(predictions.map((item) => [item.region_id, item]));

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <MapContainer center={[33.88, 35.65]} zoom={8} scrollWheelZoom className="h-[440px] w-full">
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <GeoJSON
          data={regions as never}
          style={(feature) => {
            const prediction = byRegion.get(feature?.properties.region_id ?? "");
            const color = prediction ? colors[prediction.risk_label] : "#64748b";
            return { color, fillColor: color, fillOpacity: 0.55, weight: 2 };
          }}
          onEachFeature={(feature, layer) => {
            const properties = feature.properties as RegionProps;
            const prediction = byRegion.get(properties.region_id);
            layer.bindPopup(
              prediction
                ? `<strong>${prediction.region_name}</strong><br/>Risk: ${prediction.risk_label}<br/>7-day rainfall: ${prediction.rainfall_7d} mm<br/>${prediction.recommended_action}`
                : properties.region_name
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
      </div>
    </div>
  );
}
