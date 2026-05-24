import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Prediction, RiskLabel } from "../types";

const badgeClass: Record<RiskLabel, string> = {
  Low: "bg-green-50 text-green-800 ring-green-200",
  Medium: "bg-amber-50 text-amber-900 ring-amber-200",
  High: "bg-red-50 text-red-800 ring-red-200"
};

export default function RiskTable({ predictions }: { predictions: Prediction[] }) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return predictions
      .filter((item) => !normalized || `${item.region_name} ${item.risk_label} ${item.main_drivers}`.toLowerCase().includes(normalized))
      .sort((a, b) => b.risk_score - a.risk_score);
  }, [predictions, query]);

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 p-3">
        <Search className="h-4 w-4 text-slate-500" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search regions, risk levels, or drivers"
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-river"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-panel text-left text-xs uppercase tracking-normal text-slate-600">
            <tr>
              <th className="px-4 py-3">Region</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">7-day rain</th>
              <th className="px-4 py-3">River flow</th>
              <th className="px-4 py-3">Humidity</th>
              <th className="px-4 py-3">Drivers</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((item) => (
              <tr key={item.region_id} className="align-top">
                <td className="px-4 py-3 font-medium">{item.region_name}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ring-1 ${badgeClass[item.risk_label]}`}>{item.risk_label}</span>
                </td>
                <td className="px-4 py-3">{item.rainfall_7d} mm</td>
                <td className="px-4 py-3">{item.river_discharge_ratio ? `${item.river_discharge_ratio.toFixed(2)}x` : "n/a"}</td>
                <td className="px-4 py-3">{item.humidity_avg_7d}%</td>
                <td className="max-w-xs px-4 py-3 text-slate-600">{item.main_drivers}</td>
                <td className="max-w-sm px-4 py-3 text-slate-600">{item.recommended_action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
