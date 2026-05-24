import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { Prediction, RiskLabel } from "../types";

const colors: Record<RiskLabel, string> = {
  Low: "#287b53",
  Medium: "#d98c20",
  High: "#c94132"
};

type RiskChartsProps = {
  predictions: Prediction[];
  selectedRegionId: string | null;
  onSelectRegion: (regionId: string) => void;
};

type ChartClickState = {
  activePayload?: Array<{
    payload?: {
      region_id?: string;
    };
  }>;
};

export default function RiskCharts({ predictions, selectedRegionId, onSelectRegion }: RiskChartsProps) {
  const cadasterBars = [...predictions]
    .sort((a, b) => b.risk_score - a.risk_score)
    .map((item) => ({
      ...item,
      chartLabel: item.region_name.length > 14 ? `${item.region_name.slice(0, 14)}...` : item.region_name
    }));
  const topRisk = [...predictions].sort((a, b) => b.risk_score - a.risk_score).slice(0, 10);
  const selectFromChartState = (state: ChartClickState | undefined) => {
    const regionId = state?.activePayload?.[0]?.payload?.region_id;
    if (regionId) onSelectRegion(regionId);
  };

  return (
    <div className="grid gap-4">
      <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Risk by calculated cadaster</h3>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cadasterBars} onClick={(state) => selectFromChartState(state as ChartClickState)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="chartLabel" interval={0} tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Bar dataKey="risk_score" name="Risk score" radius={[4, 4, 0, 0]}>
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
              <Scatter name="Cadasters" data={topRisk}>
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
    </div>
  );
}
