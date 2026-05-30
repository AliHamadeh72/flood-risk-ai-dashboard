import { useEffect, useState } from "react";
import { Activity, ArrowLeftRight, CloudRain, Map, MessageSquare, Table2 } from "lucide-react";
import predictions from "./data/risk_predictions.json";
import rainySeasonHistory from "./data/rainy_season_history.json";
import Chatbot from "./components/Chatbot";
import MapView from "./components/MapView";
import ModelInfo from "./components/ModelInfo";
import RiskCharts from "./components/RiskCharts";
import RiskTable from "./components/RiskTable";
import type { MapMode, Prediction, RainySeasonRecord } from "./types";

const data = predictions as Prediction[];
const rainyData = rainySeasonHistory as RainySeasonRecord[];

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [zoomRequestId, setZoomRequestId] = useState(0);
  const [mapMode, setMapMode] = useState<MapMode>("current");
  const highRisk = data.filter((item) => item.risk_label === "High");
  const positiveRisk = data.filter((item) => item.risk_score > 0);
  const highest = [...positiveRisk].sort((a, b) => b.risk_score - a.risk_score)[0];
  const avgRainfall = data.reduce((sum, item) => sum + item.rainfall_7d, 0) / data.length;
  const sortedDates = data.map((item) => item.date).sort();
  const latestDate = sortedDates[sortedDates.length - 1];
  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 700);
    return () => window.clearTimeout(timer);
  }, []);

  const selectRegion = (regionId: string) => {
    setSelectedRegionId((current) => {
      if (current === regionId) return null;
      setZoomRequestId((requestId) => requestId + 1);
      return regionId;
    });
  };
  const focusCurrentRegion = (regionId: string) => {
    setMapMode("current");
    setSelectedRegionId(regionId);
    setZoomRequestId((requestId) => requestId + 1);
  };
  const selectRainySeasonRegion = (regionId: string) => {
    setMapMode("rainy");
    setSelectedRegionId((current) => {
      if (current === regionId) return null;
      setZoomRequestId((requestId) => requestId + 1);
      return regionId;
    });
  };
  const clearSelection = () => setSelectedRegionId(null);
  const toggleMapMode = () => setMapMode((current) => (current === "current" ? "rainy" : "current"));

  return (
    <>
      {isLoading && (
        <div className="app-loading" role="status" aria-live="polite">
          <div className="loader-card">
            <div className="loader-ring" />
          </div>
        </div>
      )}
      <main className={`min-h-screen bg-[#edf2ef] text-ink transition-opacity duration-500 ${isLoading ? "opacity-0" : "opacity-100"}`}>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">Flood Risk AI Dashboard</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                Cadaster-level flood-risk view powered by Open-Meteo weather data and grounded local retrieval.
              </p>
            </div>
            <div className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600">
              Latest update: <span className="font-semibold text-ink">{latestDate}</span>
            </div>
          </div>
          <nav className="flex flex-wrap gap-2 text-sm">
            {[
              ["dashboard", "Dashboard", Activity],
              ["map", "Map", Map],
              ["table", "Table", Table2],
              ["chatbot", "Chatbot", MessageSquare]
            ].map(([href, label, Icon]) => (
              <a key={href as string} href={`#${href}`} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-panel px-3 py-2 font-medium hover:bg-white">
                <Icon className="h-4 w-4" />
                {label as string}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <section id="dashboard" className="mx-auto grid max-w-7xl gap-4 px-4 py-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        <Kpi title="High-risk areas" value={highRisk.length.toString()} detail="Regions requiring planning attention" />
        <Kpi
          title="Highest-risk region"
          value={highest ? highest.region_name : "None"}
          detail={highest ? `${Math.round(highest.risk_score * 100)}% model confidence` : "No cadaster has current flood risk"}
          onClick={highest ? () => selectRegion(highest.region_id) : undefined}
        />
        <Kpi title="Avg 7-day rainfall" value={`${avgRainfall.toFixed(1)} mm`} detail="Across selected regions" />
        <Kpi title="Weather source" value="Open-Meteo" detail="Forecast and historical cadaster pipeline" />
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-8 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8">
        <div id="map" className="min-h-[440px]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <SectionTitle icon={<Map className="h-5 w-5" />} title={mapMode === "rainy" ? "Rainy Season Risk Map" : "Current Forecast Risk Map"} />
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-ink shadow-sm transition hover:border-river hover:text-river"
              onClick={toggleMapMode}
            >
              <ArrowLeftRight className="h-4 w-4" />
              {mapMode === "rainy" ? "Back to current forecast" : "Rainy season forecast"}
            </button>
          </div>
          <MapView
            predictions={data}
            rainySeasonRecords={rainyData}
            mapMode={mapMode}
            selectedRegionId={selectedRegionId}
            zoomRequestId={zoomRequestId}
            onSelectRegion={selectRegion}
          />
        </div>
        <div>
          <SectionTitle icon={<CloudRain className="h-5 w-5" />} title="Charts" />
          <RiskCharts
            predictions={data}
            selectedRegionId={selectedRegionId}
            onSelectRegion={selectRegion}
            onSelectRainySeasonRegion={selectRainySeasonRegion}
            onClearSelection={clearSelection}
          />
        </div>
      </section>

      <section id="table" className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
        <SectionTitle icon={<Table2 className="h-5 w-5" />} title="Prediction Table" />
        <RiskTable predictions={data} />
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-10 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
        <div id="chatbot">
          <SectionTitle icon={<MessageSquare className="h-5 w-5" />} title="RAG Chatbot" />
          <Chatbot predictions={data} onSelectRegion={focusCurrentRegion} />
        </div>
        <ModelInfo />
      </section>
      </main>
    </>
  );
}

function Kpi({ title, value, detail, onClick }: { title: string; value: string; detail: string; onClick?: () => void }) {
  const className = `rounded-md border border-slate-200 bg-white p-4 text-left shadow-sm ${
    onClick ? "cursor-pointer transition hover:border-river hover:shadow-md focus:outline-none focus:ring-2 focus:ring-river" : ""
  }`;
  const content = (
    <>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-2 text-xl font-semibold leading-tight text-ink">{value}</p>
      <p className="mt-2 text-sm text-slate-600">{detail}</p>
    </>
  );

  return onClick ? (
    <button type="button" className={className} onClick={onClick} title={`Zoom to ${value}`}>
      {content}
    </button>
  ) : (
    <article className={className}>{content}</article>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
  );
}

export default App;
