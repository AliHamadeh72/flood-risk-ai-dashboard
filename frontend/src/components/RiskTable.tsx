import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import cadasters from "../data/cadasters.json";
import type { Prediction, RiskLabel } from "../types";

const pageSize = 50;

const badgeClass: Record<RiskLabel, string> = {
  Low: "bg-green-50 text-green-800 ring-green-200",
  Medium: "bg-amber-50 text-amber-900 ring-amber-200",
  High: "bg-red-50 text-red-800 ring-red-200"
};

type CadasterProperties = {
  ACS_Code?: string;
  District?: string;
  GOV?: string;
  Muni?: string;
  region_id?: string;
  region_name?: string;
};

type CalculatedRow = Prediction & { rowType: "calculated" };

type UncalculatedRow = {
  rowType: "uncalculated";
  region_id: string;
  region_name: string;
  district?: string;
  governorate?: string;
};

type TableRow = CalculatedRow | UncalculatedRow;

export default function RiskTable({ predictions }: { predictions: Prediction[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const rows = useMemo<TableRow[]>(() => {
    const normalized = query.trim().toLowerCase();
    const calculated = predictions
      .filter((item) => !normalized || `${item.region_name} ${item.risk_label} ${item.main_drivers}`.toLowerCase().includes(normalized))
      .sort((a, b) => b.risk_score - a.risk_score)
      .map((item) => ({ ...item, rowType: "calculated" as const }));

    if (!normalized) return calculated;

    const calculatedIds = new Set(predictions.map((item) => item.region_id));
    const uncalculated = (cadasters as { features: Array<{ properties?: CadasterProperties }> }).features
      .map((feature) => feature.properties)
      .filter((properties): properties is CadasterProperties => Boolean(properties))
      .map((properties) => {
        const regionId = String(properties.region_id ?? properties.ACS_Code ?? "");
        return {
          rowType: "uncalculated" as const,
          region_id: regionId,
          region_name: String(properties.region_name ?? properties.Muni ?? properties.ACS_Code ?? "Unnamed cadaster"),
          district: properties.District,
          governorate: properties.GOV
        };
      })
      .filter((item) => {
        if (!item.region_id || calculatedIds.has(item.region_id)) return false;
        return `${item.region_name} ${item.region_id} ${item.district ?? ""} ${item.governorate ?? ""}`.toLowerCase().includes(normalized);
      })
      .slice(0, 50);

    return [...calculated, ...uncalculated];
  }, [predictions, query]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  const showingStart = rows.length === 0 ? 0 : start + 1;
  const showingEnd = Math.min(start + pageSize, rows.length);

  return (
    <div className="overflow-hidden rounded-md border border-bluewave/60 bg-[#DBEAFE] shadow-sm">
      <div className="flex items-center gap-2 border-b border-bluewave/40 p-3">
        <Search className="h-4 w-4 text-bluewave" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Search calculated or uncalculated cadasters"
          className="w-full rounded-md border border-bluewave/50 px-3 py-2 text-sm outline-none focus:border-river"
        />
      </div>
      <div className="mobile-scroll overflow-x-auto">
        <table className="min-w-full divide-y divide-bluewave/30 text-sm">
          <thead className="bg-panel text-left text-xs uppercase tracking-normal text-ink">
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
          <tbody className="divide-y divide-bluewave/20 bg-white">
            {pageRows.map((item) => (
              <tr key={item.region_id} className="align-top">
                <td className="px-4 py-3 font-medium">{item.region_name}</td>
                <td className="px-4 py-3">
                  {item.rowType === "calculated" ? (
                    <span className={`rounded-md px-2 py-1 text-xs font-semibold ring-1 ${badgeClass[item.risk_label]}`}>{item.risk_label}</span>
                  ) : (
                    <span className="rounded-md bg-panel px-2 py-1 text-xs font-semibold text-ink ring-1 ring-bluewave/60">Uncalculated</span>
                  )}
                </td>
                <td className="px-4 py-3">{item.rowType === "calculated" ? `${item.rainfall_7d} mm` : "n/a"}</td>
                <td className="px-4 py-3">{item.rowType === "calculated" && item.river_discharge_ratio ? `${item.river_discharge_ratio.toFixed(2)}x` : "n/a"}</td>
                <td className="px-4 py-3">{item.rowType === "calculated" ? `${item.humidity_avg_7d}%` : "n/a"}</td>
                <td className="max-w-xs px-4 py-3 text-ink/75">
                  {item.rowType === "calculated" ? item.main_drivers : `${item.district ?? "Unknown district"}${item.governorate ? `, ${item.governorate}` : ""}`}
                </td>
                <td className="max-w-sm px-4 py-3 text-ink/75">
                  {item.rowType === "calculated" ? item.recommended_action : "No Open-Meteo weather or flood-risk calculation has been exported for this cadaster yet."}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t border-bluewave/40 px-4 py-3 text-sm text-ink/75 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <span>
          Showing {showingStart}-{showingEnd} of {rows.length}
        </span>
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <button
            type="button"
            className="rounded-md border border-bluewave/50 bg-panel px-3 py-1.5 font-medium transition hover:border-river hover:bg-river hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={currentPage === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Previous
          </button>
          <span className="font-medium text-ink">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            className="rounded-md border border-bluewave/50 bg-panel px-3 py-1.5 font-medium transition hover:border-river hover:bg-river hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={currentPage === totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
