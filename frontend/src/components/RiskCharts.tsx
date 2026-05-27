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
import rainySeasonHistory from "../data/rainy_season_history.json";
import type { Prediction, RainySeasonRecord, RiskLabel } from "../types";
import { summarizeRainySeason } from "../utils/rainySeason";

const colors: Record<RiskLabel, string> = {
  Low: "#287b53",
  Medium: "#d98c20",
  High: "#c94132"
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
  const rainySeasonChartData =
    selectedRainySeasonRisk && !topRainySeasonRisk.some((item) => item.region_id === selectedRainySeasonRisk.region_id)
      ? [...topRainySeasonRisk, { ...selectedRainySeasonRisk, chartLabel: `Selected: ${selectedRainySeasonRisk.chartLabel}` }]
      : topRainySeasonRisk;
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
      <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-700">Risk by calculated cadaster</h3>
          {selectedRegionId && <ClearSelectionButton onClick={onClearSelection} />}
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cadasterBars} onClick={(state) => selectFromChartState(state as ChartClickState)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="chartLabel" interval={0} tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Bar dataKey="risk_score" name="Risk score" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={900} animationEasing="ease-out">
                {cadasterBars.map((item) => (
                  <Cell
                    key={item.region_id}
                    fill={colors[item.risk_label]}
                    stroke={selectedRegionId === item.region_id ? "#182026" : colors[item.risk_label]}
                    strokeWidth={selectedRegionId === item.region_id ? 3 : 1}
                    cursor="pointer"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">River discharge vs risk score</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart onClick={(state) => selectFromChartState(state as ChartClickState)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="river_discharge_ratio" name="river discharge" unit="x" />
              <YAxis dataKey="risk_score" name="risk score" domain={[0, 1]} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} />
              <Legend />
              <Scatter name="Cadasters" data={topRisk} isAnimationActive animationDuration={950} animationEasing="ease-out">
                {topRisk.map((item) => (
                  <Cell
                    key={item.region_id}
                    fill={colors[item.risk_label]}
                    stroke={selectedRegionId === item.region_id ? "#182026" : colors[item.risk_label]}
                    strokeWidth={selectedRegionId === item.region_id ? 3 : 1}
                    cursor="pointer"
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-700">Average rainy-season flood risk</h3>
          {selectedRegionId && <ClearSelectionButton onClick={onClearSelection} />}
        </div>
        <p className="mb-3 text-xs text-slate-500">Top five cadasters by average rainy-season risk, plus the selected map cadaster when different.</p>
        <div className="h-60">
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
                isAnimationActive
                animationDuration={1100}
                animationEasing="ease-out"
              >
                {rainySeasonChartData.map((item) => (
                  <Cell
                    key={item.region_id}
                    fill={colors[item.risk_label]}
                    stroke={selectedRegionId === item.region_id ? "#182026" : colors[item.risk_label]}
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
      className="rounded-md border border-slate-200 bg-panel px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-river hover:bg-white hover:text-river"
      onClick={onClick}
    >
      Clear selection
    </button>
  );
}
