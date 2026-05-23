import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { Prediction, RiskLabel } from "../types";

const colors: Record<RiskLabel, string> = {
  Low: "#287b53",
  Medium: "#d98c20",
  High: "#c94132"
};

export default function RiskCharts({ predictions }: { predictions: Prediction[] }) {
  const distribution = (["Low", "Medium", "High"] as RiskLabel[]).map((label) => ({
    label,
    count: predictions.filter((item) => item.risk_label === label).length
  }));
  const topRisk = [...predictions].sort((a, b) => b.risk_score - a.risk_score).slice(0, 10);

  return (
    <div className="grid gap-4">
      <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Risk distribution</h3>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distribution}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {distribution.map((item) => (
                  <Cell key={item.label} fill={colors[item.label]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Rainfall vs risk score</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="rainfall_7d" name="7-day rainfall" unit=" mm" />
              <YAxis dataKey="risk_score" name="risk score" domain={[0, 1]} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} />
              <Legend />
              <Scatter name="Regions" data={topRisk}>
                {topRisk.map((item) => (
                  <Cell key={item.region_id} fill={colors[item.risk_label]} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
