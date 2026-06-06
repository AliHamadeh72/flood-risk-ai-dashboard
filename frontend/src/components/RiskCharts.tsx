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
import { useEffect, useMemo, useState } from "react";
import rainySeasonHistory from "../data/rainy_season_history.json";
import type { Prediction, RainySeasonRecord, RiskLabel } from "../types";
import { summarizeRainySeason } from "../utils/rainySeason";

const colors: Record<RiskLabel, string> = {
  Low: "#5DA9FF",
  Medium: "#1E5EFF",
  High: "#001F5B"
};

type RiskChartsProps = {
  predictions: Prediction[];
  selectedRegionId: string | null;
  onSelectRegion: (regionId: string) => void;
  onSelectRainySeasonRegion: (regionId: string) => void;
  onClearSelection: () => void;
  includeRainySeason?: boolean;
};

type ChartClickState = {
  activePayload?: Array<{
    payload?: {
      ACS_Code?: string;
      region_id?: string;
    };
  }>;
};

type ChartPrediction = Prediction & {
  chartLabel?: string;
};

export default function RiskCharts({
  predictions,
  selectedRegionId,
  onSelectRegion,
  onSelectRainySeasonRegion,
  onClearSelection,
  includeRainySeason = true
}: RiskChartsProps) {
  const sortedByCurrentRisk = useMemo(() => [...predictions].sort((a, b) => b.risk_score - a.risk_score), [predictions]);
  const topCurrentRisk = useMemo(() => sortedByCurrentRisk.slice(0, 5), [sortedByCurrentRisk]);
  const selectedCurrentRisk = useMemo(
    () => predictions.find((item) => item.region_id === selectedRegionId),
    [predictions, selectedRegionId]
  );
  const cadasterBars: ChartPrediction[] = useMemo(
    () =>
      selectedCurrentRisk && !topCurrentRisk.some((item) => item.region_id === selectedCurrentRisk.region_id)
        ? [...topCurrentRisk, { ...selectedCurrentRisk, chartLabel: `Selected: ${selectedCurrentRisk.region_name}` }]
        : topCurrentRisk,
    [selectedCurrentRisk, topCurrentRisk]
  );
  const currentRiskChartData = useMemo(
    () =>
      [...cadasterBars]
        .sort((a, b) => b.risk_score - a.risk_score)
        .map((item) => ({
          ...item,
          chartLabel: item.chartLabel
            ? item.chartLabel.length > 18
              ? `${item.chartLabel.slice(0, 18)}...`
              : item.chartLabel
            : item.region_name.length > 14
              ? `${item.region_name.slice(0, 14)}...`
              : item.region_name
        })),
    [cadasterBars]
  );
  const topRisk = useMemo(() => sortedByCurrentRisk.slice(0, 10), [sortedByCurrentRisk]);
  const selectFromChartState = (state: ChartClickState | undefined) => {
    const regionId = state?.activePayload?.[0]?.payload?.region_id;
    if (regionId) onSelectRegion(regionId);
  };

  return (
    <div className="grid gap-4">
      <div className="rounded-[18px] border border-white/60 bg-white/90 p-4 shadow-[0_18px_50px_rgb(31_41_55_/_0.12)] backdrop-blur-md">
        <div className="mb-3 flex items-start justify-between gap-3 sm:items-center">
          <h3 className="font-mono text-sm font-semibold text-ink">Top current-risk cadasters</h3>
          {selectedRegionId && <ClearSelectionButton onClick={onClearSelection} />}
        </div>
        <div className="startup-bar-chart h-56 sm:h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={currentRiskChartData} onClick={(state) => selectFromChartState(state as ChartClickState)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="chartLabel" interval={0} tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Bar dataKey="risk_score" name="Risk score" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {currentRiskChartData.map((item) => (
                  <Cell
                    key={item.region_id}
                    fill={colors[item.risk_label]}
                    stroke={selectedRegionId === item.region_id ? "#38BDF8" : colors[item.risk_label]}
                    strokeWidth={selectedRegionId === item.region_id ? 3 : 1}
                    cursor="pointer"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-[18px] border border-white/60 bg-ink p-4 text-white shadow-[0_18px_50px_rgb(31_41_55_/_0.16)]">
        <h3 className="mb-3 font-mono text-sm font-semibold text-white">River discharge vs risk score</h3>
        <div className="h-60 sm:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart onClick={(state) => selectFromChartState(state as ChartClickState)}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.18)" />
              <XAxis dataKey="river_discharge_ratio" name="river discharge" unit="x" tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 11 }} stroke="rgba(255,255,255,0.35)" />
              <YAxis dataKey="risk_score" name="risk score" domain={[0, 1]} tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 11 }} stroke="rgba(255,255,255,0.35)" />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} />
              <Legend wrapperStyle={{ color: "rgba(255,255,255,0.8)" }} />
              <Scatter name="Cadasters" data={topRisk} isAnimationActive animationBegin={300} animationDuration={1300} animationEasing="ease-out">
                {topRisk.map((item) => (
                  <Cell
                    key={item.region_id}
                    fill={colors[item.risk_label]}
                    stroke={selectedRegionId === item.region_id ? "#38BDF8" : colors[item.risk_label]}
                    strokeWidth={selectedRegionId === item.region_id ? 3 : 1}
                    cursor="pointer"
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {includeRainySeason && (
        <RainySeasonRiskChart
          predictions={predictions}
          selectedRegionId={selectedRegionId}
          onSelectRainySeasonRegion={onSelectRainySeasonRegion}
          onClearSelection={onClearSelection}
        />
      )}
    </div>
  );
}

export function RainySeasonRiskChart({
  predictions,
  selectedRegionId,
  onSelectRainySeasonRegion,
  onClearSelection
}: Pick<RiskChartsProps, "predictions" | "selectedRegionId" | "onSelectRainySeasonRegion" | "onClearSelection">) {
  const [rainyStartupAnimation, setRainyStartupAnimation] = useState(true);
  const rainySeasonRisk = useMemo(
    () => summarizeRainySeason(predictions, rainySeasonHistory as RainySeasonRecord[]),
    [predictions]
  );
  const topRainySeasonRisk = useMemo(() => rainySeasonRisk.slice(0, 5), [rainySeasonRisk]);
  const selectedRainySeasonRisk = useMemo(
    () => rainySeasonRisk.find((item) => item.region_id === selectedRegionId),
    [rainySeasonRisk, selectedRegionId]
  );
  const selectedRainySeasonIsExtra = Boolean(
    selectedRainySeasonRisk && !topRainySeasonRisk.some((item) => item.region_id === selectedRainySeasonRisk.region_id)
  );
  const rainySeasonChartData =
    selectedRainySeasonRisk && selectedRainySeasonIsExtra
      ? [...topRainySeasonRisk, { ...selectedRainySeasonRisk, chartLabel: `Selected: ${selectedRainySeasonRisk.chartLabel}` }]
      : topRainySeasonRisk;
  const selectRainySeasonFromChartState = (state: ChartClickState | undefined) => {
    const regionId = state?.activePayload?.[0]?.payload?.region_id;
    if (regionId) onSelectRainySeasonRegion(regionId);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setRainyStartupAnimation(false), 2600);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="rounded-[18px] border border-white/60 bg-white/90 p-4 shadow-[0_18px_50px_rgb(31_41_55_/_0.12)] backdrop-blur-md">
      <div className="mb-3 flex items-start justify-between gap-3 sm:items-center">
        <h3 className="font-mono text-sm font-semibold text-ink">Average rainy-season flood risk</h3>
        {selectedRegionId && <ClearSelectionButton onClick={onClearSelection} />}
      </div>
      <p className="mb-3 text-xs text-ink/65">Top five cadasters by average rainy-season risk, plus the selected map cadaster when different.</p>
      <div className={`${rainyStartupAnimation ? "startup-bar-chart" : ""} h-64 sm:h-60`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rainySeasonChartData} onClick={(state) => selectRainySeasonFromChartState(state as ChartClickState)}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="chartLabel" interval={0} tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 1]} />
            <Tooltip />
            <Bar dataKey="average_risk_score" name="Average flood risk" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {rainySeasonChartData.map((item) => (
                <Cell
                  key={item.region_id}
                  fill={colors[item.risk_label]}
                  className={selectedRainySeasonIsExtra && item.region_id === selectedRegionId ? "selected-rainy-bar" : undefined}
                  stroke={selectedRegionId === item.region_id ? "#38BDF8" : colors[item.risk_label]}
                  strokeWidth={selectedRegionId === item.region_id ? 3 : 1}
                  cursor="pointer"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ClearSelectionButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="rounded-full border border-bluewave/50 bg-white px-3 py-1 text-xs font-semibold text-ink transition hover:border-river hover:bg-river hover:text-white"
      onClick={onClick}
    >
      Clear selection
    </button>
  );
}
