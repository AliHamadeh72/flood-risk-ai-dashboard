import { useEffect, useMemo } from "react";
import L from "leaflet";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import cadasters from "../data/cadasters.json";
import type { MapMode, Prediction, RainySeasonRecord, RiskLabel } from "../types";

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
  rainySeasonRecords: RainySeasonRecord[];
  mapMode: MapMode;
  selectedRegionId: string | null;
  zoomRequestId: number;
  onSelectRegion: (regionId: string) => void;
};

type RainySeasonSummary = {
  region_id: string;
  region_name: string;
  risk_label: RiskLabel;
  rainfall_mm: number;
  river_discharge: number;
  peak_month: string;
};

const riskRank: Record<RiskLabel, number> = {
  Low: 1,
  Medium: 2,
  High: 3
};

export default function MapView({ predictions, rainySeasonRecords, mapMode, selectedRegionId, zoomRequestId, onSelectRegion }: MapViewProps) {
  const byRegion = new Map(predictions.map((item) => [item.region_id, item]));
  const byCadaster = new Map(predictions.map((item) => [item.region_id, item]));
  const rainyByRegion = useMemo(() => buildRainySeasonSummaries(predictions, rainySeasonRecords), [predictions, rainySeasonRecords]);
  const selectedName =
    mapMode === "rainy"
      ? rainyByRegion.get(selectedRegionId ?? "")?.region_name ?? predictions.find((item) => item.region_id === selectedRegionId)?.region_name
      : predictions.find((item) => item.region_id === selectedRegionId)?.region_name;

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <MapContainer center={[33.88, 35.65]} zoom={8} scrollWheelZoom className="h-[440px] w-full">
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ZoomToCadaster selectedRegionId={selectedRegionId} zoomRequestId={zoomRequestId} />
        <GeoJSON
          key={`${mapMode}-${selectedRegionId ?? "no-selection"}`}
          data={cadasters as never}
          style={(feature) => {
            const properties = feature?.properties as RegionProps | undefined;
            const featureId = properties?.region_id ?? properties?.ACS_Code ?? "";
            const prediction = byRegion.get(featureId) ?? byCadaster.get(featureId);
            const rainySummary = rainyByRegion.get(featureId);
            const isSelected = selectedRegionId === featureId;
            const layerRisk = mapMode === "rainy" ? rainySummary?.risk_label : prediction?.risk_label;
            const color = layerRisk ? colors[layerRisk] : "#94a3b8";
            return {
              color,
              fillColor: color,
              fillOpacity: isSelected ? 0.42 : layerRisk ? 0.28 : 0.16,
              opacity: isSelected ? 1 : layerRisk ? 0.7 : 0.45,
              weight: isSelected ? 3 : layerRisk ? 1.2 : 0.6
            };
          }}
          onEachFeature={(feature, layer) => {
            const properties = feature.properties as RegionProps;
            const featureId = properties.region_id ?? properties.ACS_Code ?? "";
            const label = properties.region_name ?? properties.Cadaster ?? properties.name ?? properties.ACS_Code ?? "Uncalculated cadaster";
            const prediction = byRegion.get(featureId) ?? byCadaster.get(featureId);
            const rainySummary = rainyByRegion.get(featureId);
            layer.bindPopup(
              mapMode === "rainy" && rainySummary
                ? `<strong>${rainySummary.region_name}</strong><br/>Rainy-season risk: ${rainySummary.risk_label}<br/>Rainy-season rainfall: ${rainySummary.rainfall_mm.toFixed(1)} mm<br/>Peak river flow: ${rainySummary.river_discharge.toFixed(1)} m3/s<br/>Peak month: ${rainySummary.peak_month}`
                : prediction
                ? `<strong>${prediction.region_name}</strong><br/>Risk: ${prediction.risk_label}<br/>7-day rainfall: ${prediction.rainfall_7d} mm<br/>River discharge: ${prediction.river_discharge_ratio ? `${prediction.river_discharge_ratio.toFixed(2)}x mean` : "n/a"}<br/>${prediction.recommended_action}`
                : `<strong>${label}</strong><br/>${mapMode === "rainy" ? "Rainy-season risk not calculated yet" : "Risk not calculated yet"}`
            );
            if (prediction || rainySummary) {
              layer.on("click", () => onSelectRegion((rainySummary ?? prediction)?.region_id ?? featureId));
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
        <span className="font-medium text-slate-600">{mapMode === "rainy" ? "Showing rainy-season flood risk" : "Showing current forecast risk"}</span>
      </div>
    </div>
  );
}

function buildRainySeasonSummaries(predictions: Prediction[], records: RainySeasonRecord[]) {
  const names = new Map(predictions.map((item) => [item.region_id, item.region_name]));
  const summaries = new Map<string, RainySeasonSummary>();

  for (const record of records) {
    const current = summaries.get(record.ACS_Code);
    const currentRank = current ? riskRank[current.risk_label] : 0;
    const recordRank = riskRank[record.risk_label];
    const nextRainfall = (current?.rainfall_mm ?? 0) + record.rainfall_mm;
    const peakFlow = Math.max(current?.river_discharge ?? 0, record.river_discharge);
    const peakMonth = !current || record.river_discharge >= current.river_discharge ? record.month : current.peak_month;

    summaries.set(record.ACS_Code, {
      region_id: record.ACS_Code,
      region_name: names.get(record.ACS_Code) ?? `Cadaster ${record.ACS_Code}`,
      risk_label: recordRank >= currentRank ? record.risk_label : current?.risk_label ?? record.risk_label,
      rainfall_mm: nextRainfall,
      river_discharge: peakFlow,
      peak_month: peakMonth
    });
  }

  return summaries;
}

function ZoomToCadaster({ selectedRegionId, zoomRequestId }: { selectedRegionId: string | null; zoomRequestId: number }) {
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
      map.flyToBounds(bounds, {
        animate: true,
        duration: 1.35,
        easeLinearity: 0.2,
        maxZoom: 13,
        padding: [36, 36]
      });
    }
  }, [map, selectedFeature, zoomRequestId]);

  return null;
}
