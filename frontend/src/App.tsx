import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeftRight, CloudRain, Map as MapIcon, MessageSquare, Table2 } from "lucide-react";
import predictions from "./data/risk_predictions.json";
import rainySeasonHistory from "./data/rainy_season_history.json";
import Alert from "./components/Alert";
import Chatbot from "./components/Chatbot";
import MapView from "./components/MapView";
import ModelInfo from "./components/ModelInfo";
import RiskCharts, { RainySeasonRiskChart } from "./components/RiskCharts";
import RiskTable from "./components/RiskTable";
import type { MapMode, Prediction, RainySeasonRecord } from "./types";

const baseData = predictions as Prediction[];
const rainyData = rainySeasonHistory as RainySeasonRecord[];
const backgroundSpans = Array.from({ length: 25 }, (_, index) => <span key={index} />);
const navItems = [
  ["dashboard", "Dashboard", Activity],
  ["map", "Map", MapIcon],
  ["table", "Table", Table2],
  ["chatbot", "Chatbot", MessageSquare]
] as const;
const kpiSkeletonSlots = ["high-risk", "highest-risk", "rainfall", "source"] as const;
const layout = {
  header: "app-header z-30 border-b border-white/40 bg-panel/90 backdrop-blur-xl",
  headerInner: "mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4 lg:px-8",
  headerRow: "flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4",
  nav: "mobile-nav -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0",
  kpiGrid: "page-section mx-auto grid max-w-7xl gap-4 px-4 py-5 sm:grid-cols-2 sm:px-6 sm:py-6 lg:grid-cols-4 lg:px-8",
  mapChartsGrid: "mx-auto grid max-w-7xl gap-5 px-4 pb-7 sm:gap-6 sm:px-6 sm:pb-8 lg:grid-cols-[1.15fr_0.85fr] lg:px-8",
  chatRainyGrid: "mx-auto grid max-w-7xl gap-5 px-4 pb-7 sm:gap-6 sm:px-6 sm:pb-8 lg:grid-cols-[0.95fr_1.05fr] lg:px-8",
  fullWidthSection: "mx-auto max-w-7xl px-4 pb-7 sm:px-6 sm:pb-8 lg:px-8",
  card: "rounded-[18px] border border-white/60 bg-white/90 shadow-[0_18px_50px_rgb(31_41_55_/_0.12)] backdrop-blur-md",
  cardPadded: "rounded-[18px] border border-white/60 bg-white/90 p-4 shadow-[0_18px_50px_rgb(31_41_55_/_0.12)] backdrop-blur-md"
};

const testAlertTarget = (() => {
  let latestDate = "";
  for (const item of baseData) {
    if (item.date > latestDate) latestDate = item.date;
  }
  return baseData.find((item) => item.date === latestDate && item.risk_label !== "High") ?? baseData.find((item) => item.date === latestDate) ?? baseData[0];
})();

const calculateDashboardStats = (records: Prediction[]) => {
  const highRisk: Prediction[] = [];
  let highest: Prediction | undefined;
  let rainfallTotal = 0;
  let latestDate = "";

  for (const item of records) {
    if (item.risk_label === "High") highRisk.push(item);
    if (item.risk_score > 0 && (!highest || item.risk_score > highest.risk_score)) highest = item;
    rainfallTotal += item.rainfall_7d;
    if (item.date > latestDate) latestDate = item.date;
  }

  return {
    highRisk,
    highest,
    avgRainfall: rainfallTotal / records.length,
    latestDate
  };
};

function App() {
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [dashboardData, setDashboardData] = useState<Prediction[]>(baseData);
  const [isTestAlertActive, setIsTestAlertActive] = useState(false);
  const [alertRenderKey, setAlertRenderKey] = useState(0);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [alertRegionId, setAlertRegionId] = useState<string | null>(null);
  const [zoomRequestId, setZoomRequestId] = useState(0);
  const [mapMode, setMapMode] = useState<MapMode>("current");
  const [optimisticModeLabel, setOptimisticModeLabel] = useState<string | null>(null);
  const dashboardStats = useMemo(() => calculateDashboardStats(dashboardData), [dashboardData]);
  const dataByRegion = useMemo(() => new globalThis.Map(dashboardData.map((item) => [item.region_id, item])), [dashboardData]);
  const selectedRegionName = selectedRegionId ? dataByRegion.get(selectedRegionId)?.region_name ?? selectedRegionId : "None";

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSkeleton(false), 1200);
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
  const highlightAlertRegion = (regionId: string) => {
    setMapMode("current");
    setAlertRegionId(regionId);
    setSelectedRegionId(regionId);
    setZoomRequestId((requestId) => requestId + 1);
    document.getElementById("map")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const toggleMapMode = () => {
    setMapMode((current) => {
      const next = current === "current" ? "rainy" : "current";
      setOptimisticModeLabel(next === "rainy" ? "Switching to rainy season..." : "Switching to current forecast...");
      return next;
    });
    window.setTimeout(() => setOptimisticModeLabel(null), 700);
  };
  const triggerTestAlert = () => {
    if (!testAlertTarget) return;
    setDashboardData((records) =>
      records.map((item) =>
        item.region_id === testAlertTarget.region_id && item.date === testAlertTarget.date
          ? {
              ...item,
              risk_label: "High",
              risk_score: 1,
              rainfall_7d: Math.max(item.rainfall_7d, 28)
            }
          : item
      )
    );
    setIsTestAlertActive(true);
    setAlertRenderKey((key) => key + 1);
  };
  const resetTestAlert = () => {
    setDashboardData(baseData);
    setIsTestAlertActive(false);
    setAlertRenderKey((key) => key + 1);
  };

  return (
    <>
      {showSkeleton ? (
        <DashboardSkeleton />
      ) : (
      <main className="watercolor-backdrop min-h-dvh text-ink">
      <div className="animated-background" aria-hidden="true">{backgroundSpans}</div>
      <header className={`${layout.header} header-slide-up`}>
        <div className={layout.headerInner}>
          <div className={layout.headerRow}>
            <div className="min-w-0">
              <p className="font-mono text-xs font-semibold text-river">open-meteo / cadaster-risk</p>
              <h1 className="mt-1 text-2xl font-black leading-none tracking-tight sm:text-4xl">Flood Risk AI Dashboard</h1>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-ink/75 sm:text-sm">
                Cadaster-level flood-risk view powered by Open-Meteo weather data and grounded local retrieval.
              </p>
            </div>
            <div className="w-fit rounded-full border border-white/70 bg-white/80 px-4 py-2 text-xs text-ink shadow-sm sm:text-sm">
              Latest update: <span className="font-semibold text-ink">{dashboardStats.latestDate}</span>
            </div>
          </div>
          <nav className={layout.nav}>
            {navItems.map(([href, label, Icon]) => (
              <a key={href as string} href={`#${href}`} className="inline-flex flex-none items-center gap-2 rounded-full border border-white/70 bg-white/80 px-4 py-2 font-semibold text-ink transition hover:border-river hover:bg-river hover:text-white">
                <Icon className="h-4 w-4" />
                {label as string}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <div className="flood-alert-layer" aria-live="polite">
        <Alert key={alertRenderKey} predictions={dashboardData} onHighlightRegion={highlightAlertRegion} />
      </div>
      <div className="alert-test-controls mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pt-4 sm:px-6 lg:px-8">
        <span className="alert-test-controls__label">Alert test</span>
        <button type="button" className="alert-test-controls__button" onClick={triggerTestAlert} disabled={isTestAlertActive || !testAlertTarget}>
          Trigger high risk
        </button>
        <button type="button" className="alert-test-controls__button alert-test-controls__button--ghost" onClick={resetTestAlert} disabled={!isTestAlertActive}>
          Reverse
        </button>
        {testAlertTarget && <span className="alert-test-controls__meta">{testAlertTarget.region_name}</span>}
      </div>

      <section className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
        <div className="grid overflow-hidden rounded-[18px] border border-white/60 bg-ink text-xs text-white shadow-[0_18px_50px_rgb(31_41_55_/_0.14)] sm:grid-cols-4">
          <StatusItem label="Active layer" value={mapMode === "rainy" ? "Rainy season" : "Current forecast"} />
          <StatusItem label="Calculated cadasters" value={dashboardData.length.toString()} />
          <StatusItem label="High-risk share" value={`${Math.round((dashboardStats.highRisk.length / dashboardData.length) * 100)}%`} />
          <StatusItem label="Selected cadaster" value={selectedRegionName} />
        </div>
      </section>

      <section id="dashboard" className={layout.kpiGrid}>
        <Kpi tone="alert" title="High-risk areas" value={dashboardStats.highRisk.length.toString()} detail="Regions requiring planning attention" />
        <Kpi
          tone="river"
          title="Highest-risk region"
          value={dashboardStats.highest ? dashboardStats.highest.region_name : "None"}
          detail={dashboardStats.highest ? `${Math.round(dashboardStats.highest.risk_score * 100)}% model confidence` : "No cadaster has current flood risk"}
          onClick={dashboardStats.highest ? () => selectRegion(dashboardStats.highest!.region_id) : undefined}
        />
        <Kpi tone="safe" title="Avg 7-day rainfall" value={`${dashboardStats.avgRainfall.toFixed(1)} mm`} detail="Across selected regions" />
        <Kpi tone="neutral" title="Weather source" value="Open-Meteo" detail="Forecast and historical cadaster pipeline" />
      </section>

      <section className={layout.mapChartsGrid}>
        <div id="map" className="page-section min-h-[360px] sm:min-h-[440px]">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <SectionTitle icon={<MapIcon className="h-5 w-5" />} title={mapMode === "rainy" ? "Rainy Season Risk Map" : "Current Forecast Risk Map"} />
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <button
                type="button"
                className="tooltip-trigger inline-flex w-fit items-center gap-2 rounded-full border border-white/70 bg-white/90 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-river hover:bg-river hover:text-white"
                onClick={toggleMapMode}
                aria-describedby="rainy-season-toggle-tip"
              >
                <ArrowLeftRight className="h-4 w-4" />
                {mapMode === "rainy" ? "Back to current forecast" : "Rainy season forecast"}
                <span id="rainy-season-toggle-tip" role="tooltip" className="tooltip-bubble">
                  {mapMode === "rainy" ? "Switch the map back to the latest Open-Meteo forecast risk layer." : "Show average rainy-season flood risk for each cadaster."}
                </span>
              </button>
              {optimisticModeLabel && <span className="text-xs font-medium text-river">{optimisticModeLabel}</span>}
            </div>
          </div>
          <MapView
            predictions={dashboardData}
            rainySeasonRecords={rainyData}
            mapMode={mapMode}
            selectedRegionId={selectedRegionId}
            alertRegionId={alertRegionId}
            zoomRequestId={zoomRequestId}
            onSelectRegion={selectRegion}
          />
        </div>
        <div className="xl:max-h-[520px] xl:overflow-y-auto xl:pr-1">
          <SectionTitle icon={<CloudRain className="h-5 w-5" />} title="Charts" />
          <RiskCharts
            predictions={dashboardData}
            selectedRegionId={selectedRegionId}
            onSelectRegion={selectRegion}
            onSelectRainySeasonRegion={selectRainySeasonRegion}
            onClearSelection={clearSelection}
            includeRainySeason={false}
          />
        </div>
      </section>

      <section className={layout.chatRainyGrid}>
        <div id="chatbot" className="page-section">
          <SectionTitle icon={<MessageSquare className="h-5 w-5" />} title="RAG Chatbot" />
          <Chatbot predictions={dashboardData} onSelectRegion={focusCurrentRegion} />
        </div>
        <div>
          <SectionTitle icon={<CloudRain className="h-5 w-5" />} title="Rainy Season" />
          <RainySeasonRiskChart
            predictions={dashboardData}
            selectedRegionId={selectedRegionId}
            onSelectRainySeasonRegion={selectRainySeasonRegion}
            onClearSelection={clearSelection}
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-7 sm:px-6 sm:pb-8 lg:px-8">
        <ModelInfo />
      </section>

      <section id="table" className={`page-section ${layout.fullWidthSection}`}>
        <SectionTitle icon={<Table2 className="h-5 w-5" />} title="Prediction Table" />
        <RiskTable predictions={dashboardData} />
      </section>
      </main>
      )}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <main className="skeleton-screen watercolor-backdrop min-h-dvh text-ink" role="status" aria-live="polite" aria-label="Loading dashboard">
      <div className="animated-background" aria-hidden="true">{backgroundSpans}</div>
      <header className={layout.header}>
        <div className={layout.headerInner}>
          <div className={layout.headerRow}>
            <div className="min-w-0">
              <div className="skeleton-line h-7 w-72 max-w-full sm:h-9" />
              <div className="skeleton-line mt-3 h-4 w-full max-w-3xl" />
            </div>
            <div className="skeleton-pill h-10 w-44" />
          </div>
          <nav className={layout.nav}>
            {navItems.map(([href]) => (
              <div key={href} className="skeleton-pill h-10 w-28 flex-none" />
            ))}
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
        <div className="grid overflow-hidden rounded-[18px] border border-white/60 bg-white/80 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="border-b border-white/60 px-3 py-2 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
              <div className="skeleton-line h-3 w-24" />
              <div className="skeleton-line mt-2 h-4 w-32 max-w-full" />
            </div>
          ))}
        </div>
      </section>

      <section className={layout.kpiGrid}>
        {kpiSkeletonSlots.map((slot) => (
          <div key={slot} className={layout.cardPadded}>
            <div className="skeleton-line h-4 w-28" />
            <div className="skeleton-line mt-3 h-7 w-36" />
            <div className="skeleton-line mt-3 h-4 w-44 max-w-full" />
          </div>
        ))}
      </section>

      <section className={layout.mapChartsGrid}>
        <div className="page-section min-h-[360px] sm:min-h-[440px]">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="skeleton-line h-6 w-56" />
            <div className="skeleton-pill h-10 w-44" />
          </div>
          <div className={`overflow-hidden ${layout.card}`}>
            <div className="skeleton-block h-[360px] sm:h-[440px]" />
            <div className="flex flex-wrap gap-3 border-t border-white/70 bg-panel/80 px-4 py-3">
              <div className="skeleton-pill h-5 w-16" />
              <div className="skeleton-pill h-5 w-20" />
              <div className="skeleton-pill h-5 w-14" />
              <div className="skeleton-pill h-5 w-36" />
            </div>
          </div>
        </div>
        <div className="xl:max-h-[520px] xl:overflow-y-auto xl:pr-1">
          <div className="mb-3 flex items-center gap-2">
            <div className="skeleton-line h-6 w-28" />
          </div>
          <div className="grid gap-4">
            <SkeletonPanel titleWidth="w-44" height="h-56 sm:h-52" />
            <SkeletonPanel titleWidth="w-52" height="h-60 sm:h-56" />
          </div>
        </div>
      </section>

      <section className={layout.chatRainyGrid}>
        <div className="page-section">
          <div className="mb-3 flex items-center gap-2">
            <div className="skeleton-line h-6 w-36" />
          </div>
          <div className={`flex min-h-[360px] flex-col sm:min-h-[430px] ${layout.cardPadded}`}>
            <div className="skeleton-line h-10 w-3/4" />
            <div className="skeleton-line ml-auto mt-4 h-10 w-2/3" />
            <div className="skeleton-line mt-4 h-16 w-5/6" />
            <div className="mt-auto flex gap-2 border-t border-white/70 pt-3">
              <div className="skeleton-pill h-10 flex-1" />
              <div className="skeleton-pill h-10 w-10" />
            </div>
          </div>
        </div>
        <div>
          <div className="mb-3 flex items-center gap-2">
            <div className="skeleton-line h-6 w-40" />
          </div>
          <SkeletonPanel titleWidth="w-56" height="h-64 sm:h-60" />
        </div>
      </section>

      <section className={layout.fullWidthSection}>
        <div className={layout.cardPadded}>
          <div className="skeleton-line h-5 w-52" />
          <div className="skeleton-line mt-3 h-4 w-full max-w-4xl" />
          <div className="skeleton-line mt-3 h-4 w-full max-w-3xl" />
        </div>
      </section>

      <section className={`page-section ${layout.fullWidthSection}`}>
        <div className="mb-3 flex items-center gap-2">
          <div className="skeleton-line h-6 w-44" />
        </div>
        <div className={`overflow-hidden ${layout.card}`}>
          <div className="flex items-center gap-2 border-b border-white/70 bg-panel/80 p-3">
            <div className="skeleton-pill h-10 w-full" />
          </div>
          <div className="bg-white p-4">
            {Array.from({ length: 7 }, (_, index) => (
              <div key={index} className="grid grid-cols-[1.1fr_0.6fr_0.7fr_0.7fr] gap-3 border-b border-bluewave/10 py-3 last:border-b-0">
                <div className="skeleton-line h-4 w-full" />
                <div className="skeleton-line h-4 w-full" />
                <div className="skeleton-line h-4 w-full" />
                <div className="skeleton-line h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function SkeletonPanel({ titleWidth, height }: { titleWidth: string; height: string }) {
  return (
    <div className={layout.cardPadded}>
      <div className={`skeleton-line h-5 ${titleWidth}`} />
      <div className={`skeleton-block mt-4 ${height}`} />
    </div>
  );
}

function Kpi({ title, value, detail, tone = "neutral", onClick }: { title: string; value: string; detail: string; tone?: "alert" | "river" | "safe" | "neutral"; onClick?: () => void }) {
  const toneClass = {
    alert: "border-l-4 border-l-alert",
    river: "border-l-4 border-l-river",
    safe: "border-l-4 border-l-safe",
    neutral: "border-l-4 border-l-slate-400"
  }[tone];
  const className = `kpi-slide-wrapper ${layout.cardPadded} ${toneClass} text-left ${
    onClick ? "cursor-pointer transition hover:border-river focus:outline-none focus:ring-2 focus:ring-river" : ""
  }`;
  const content = (
    <div className="overflow-hidden">
      <div className="kpi-slide-text">
      <p className="font-mono text-xs font-semibold text-ink/60">{title}</p>
      <p className="mt-2 text-2xl font-black leading-tight tracking-tight text-ink">{value}</p>
      <p className="mt-2 text-sm text-ink/75">{detail}</p>
      </div>
    </div>
  );

  return onClick ? (
    <button type="button" className={className} onClick={onClick} title={`Zoom to ${value}`}>
      {content}
    </button>
  ) : (
    <article className={className}>{content}</article>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-card min-w-0 border-b border-white/20 px-3 py-2 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="font-mono text-[0.68rem] font-semibold text-white/60">{label}</p>
      <div className="overflow-hidden">
        <p className="status-slide-text mt-1 truncate font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-river">{icon}</span>
      <h2 className="text-xl font-black leading-none tracking-tight sm:text-2xl">{title}</h2>
    </div>
  );
}

export default App;
