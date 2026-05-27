import type { Prediction, RainySeasonRecord, RiskLabel } from "../types";

export type RainySeasonSummary = {
  region_id: string;
  region_name: string;
  risk_label: RiskLabel;
  average_risk_score: number;
  rainfall_mm: number;
  river_discharge: number;
  peak_month: string;
  data_status: "observed" | "estimated";
  chartLabel: string;
};

const riskScores: Record<RiskLabel, number> = {
  Low: 0.25,
  Medium: 0.55,
  High: 0.85
};

export function summarizeRainySeason(predictions: Prediction[], records: RainySeasonRecord[]) {
  const names = new Map(predictions.map((item) => [item.region_id, item.region_name]));
  const grouped = new Map<string, RainySeasonRecord[]>();

  for (const record of records) {
    grouped.set(record.ACS_Code, [...(grouped.get(record.ACS_Code) ?? []), record]);
  }

  return [...grouped.entries()]
    .map(([regionId, group]) => {
      const averageRisk =
        group.reduce((sum, item) => sum + (item.average_risk_score ?? riskScores[item.risk_label]), 0) / group.length;
      const rainfall = group.reduce((sum, item) => sum + item.rainfall_mm, 0);
      const peak = group.reduce((best, item) => (item.river_discharge >= best.river_discharge ? item : best), group[0]);
      const regionName = names.get(regionId) ?? group[0].region_name ?? `Cadaster ${regionId}`;
      const riskLabel: RiskLabel = averageRisk >= 0.7 ? "High" : averageRisk >= 0.4 ? "Medium" : "Low";
      const dataStatus = group.some((item) => item.data_status === "observed") ? "observed" : "estimated";

      return {
        region_id: regionId,
        region_name: regionName,
        risk_label: riskLabel,
        average_risk_score: Number(averageRisk.toFixed(2)),
        rainfall_mm: Number(rainfall.toFixed(1)),
        river_discharge: peak.river_discharge,
        peak_month: peak.month,
        data_status: dataStatus,
        chartLabel: regionName.length > 14 ? `${regionName.slice(0, 14)}...` : regionName
      };
    })
    .sort((a, b) => b.average_risk_score - a.average_risk_score);
}
