import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useEffect, useState } from "react";
import rainySeasonHistory from "../data/rainy_season_history.json";
import type { Prediction, RainySeasonRecord, RiskLabel } from "../types";
import { summarizeRainySeason } from "../utils/rainySeason";

const colors: Record<RiskLabel, string> = {
  Low: "#80DEEA",
  Medium: "#0288D1",
  High: "#01579B"
};

type RiskChartsProps = {
  predictions: Prediction[];
  selectedRegionId: string | null;
  onSelectRegion: (regionId: string) => void;
  onSelectRainySeasonRegion: (regionId: string) => void;
  onClearSelection: () => void;
};

type ChartClickState = {
  activePayload?: Array<{
    payload?: {
      ACS_Code?: string;
      region_id?: string;
    };
  }>;
};

export default function RiskCharts({ predictions, selectedRegionId, onSelectRegion, onSelectRainySeasonRegion, onClearSelection }: RiskChartsProps) {
  const [rainyStartupAnimation, setRainyStartupAnimation] = useState(true);
  const cadasterBars = [...predictions]
    .sort((a, b) => b.risk_score - a.risk_score)
    .map((item) => ({
      ...item,
      chartLabel: item.region_name.length > 14 ? `${item.region_name.slice(0, 14)}...` : item.region_name
    }));
  const topRisk = [...predictions].sort((a, b) => b.risk_score - a.risk_score).slice(0, 10);
  const rainySeasonRisk = summarizeRainySeason(predictions, rainySeasonHistory as RainySeasonRecord[]);
  const topRainySeasonRisk = rainySeasonRisk.slice(0, 5);
  const selectedRainySeasonRisk = rainySeasonRisk.find((item) => item.region_id === selectedRegionId);
  const selectedRainySeasonIsExtra = Boolean(
    selectedRainySeasonRisk && !topRainySeasonRisk.some((item) => item.region_id === selectedRainySeasonRisk.region_id)
  );
  const rainySeasonChartData =
    selectedRainySeasonRisk && selectedRainySeasonIsExtra
      ? [...topRainySeasonRisk, { ...selectedRainySeasonRisk, chartLabel: `Selected: ${selectedRainySeasonRisk.chartLabel}` }]
      : topRainySeasonRisk;

  useEffect(() => {
    const timer = window.setTimeout(() => setRainyStartupAnimation(false), 2600);
    return () => window.clearTimeout(timer);
  }, []);
  const selectFromChartState = (state: ChartClickState | undefined) => {
    const regionId = state?.activePayload?.[0]?.payload?.region_id;
    if (regionId) onSelectRegion(regionId);
  };
  const selectRainySeasonFromChartState = (state: ChartClickState | undefined) => {
    const regionId = state?.activePayload?.[0]?.payload?.region_id;
    if (regionId) onSelectRainySeasonRegion(regionId);
  };

  return (
    <div className="grid gap-4">
      <div className="rounded-md border border-bluewave/60 bg-[#DBEAFE] p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">Risk by calculated cadaster</h3>
          {selectedRegionId && <ClearSelectionButton onClick={onClearSelection} />}
        </div>
        <div className="startup-bar-chart h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cadasterBars} onClick={(state) => selectFromChartState(state as ChartClickState)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="chartLabel" interval={0} tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Bar
                dataKey="risk_score"
                name="Risk score"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              >
                {cadasterBars.map((item) => (
                  <Cell
                    key={item.region_id}
                    fill={colors[item.risk_label]}
                    stroke={selectedRegionId === item.region_id ? "#DBEAFE" : colors[item.risk_label]}
                    strokeWidth={selectedRegionId === item.region_id ? 3 : 1}
                    cursor="pointer"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-md border border-bluewave/60 bg-[#DBEAFE] p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-ink">River discharge vs risk score</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart onClick={(state) => selectFromChartState(state as ChartClickState)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="river_discharge_ratio" name="river discharge" unit="x" />
              <YAxis dataKey="risk_score" name="risk score" domain={[0, 1]} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} />
              <Legend />
              <Scatter
                name="Cadasters"
                data={topRisk}
                isAnimationActive
                animationBegin={300}
                animationDuration={1300}
                animationEasing="ease-out"
              >
                {topRisk.map((item) => (
                  <Cell
                    key={item.region_id}
                    fill={colors[item.risk_label]}
                    stroke={selectedRegionId === item.region_id ? "#DBEAFE" : colors[item.risk_label]}
                    strokeWidth={selectedRegionId === item.region_id ? 3 : 1}
                    cursor="pointer"
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-md border border-bluewave/60 bg-[#DBEAFE] p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">Average rainy-season flood risk</h3>
          {selectedRegionId && <ClearSelectionButton onClick={onClearSelection} />}
        </div>
        <p className="mb-3 text-xs text-ink/65">Top five cadasters by average rainy-season risk, plus the selected map cadaster when different.</p>
        <div className={`${rainyStartupAnimation ? "startup-bar-chart" : ""} h-60`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rainySeasonChartData} onClick={(state) => selectRainySeasonFromChartState(state as ChartClickState)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="chartLabel" interval={0} tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Bar
                dataKey="average_risk_score"
                name="Average flood risk"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              >
                {rainySeasonChartData.map((item) => (
                  <Cell
                    key={item.region_id}
                    fill={colors[item.risk_label]}
                    className={selectedRainySeasonIsExtra && item.region_id === selectedRegionId ? "selected-rainy-bar" : undefined}
                    stroke={selectedRegionId === item.region_id ? "#DBEAFE" : colors[item.risk_label]}
                    strokeWidth={selectedRegionId === item.region_id ? 3 : 1}
                    cursor="pointer"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function ClearSelectionButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="rounded-md border border-bluewave/50 bg-panel px-2 py-1 text-xs font-medium text-ink transition hover:border-river hover:bg-river hover:text-white"
      onClick={onClick}
    >
      Clear selection
    </button>
  );
}
