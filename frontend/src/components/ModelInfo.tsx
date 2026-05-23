import { BrainCircuit } from "lucide-react";

const features = [
  "rainfall_1d",
  "rainfall_3d",
  "rainfall_7d",
  "rainfall_14d",
  "humidity_avg_7d",
  "temperature_avg_7d",
  "wind_avg_7d",
  "elevation_mean",
  "slope_mean",
  "distance_to_river_km"
];

export default function ModelInfo() {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <BrainCircuit className="h-5 w-5 text-river" />
        <h2 className="text-lg font-semibold">Model Info</h2>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Info label="Model type" value="RandomForestClassifier baseline" />
        <Info label="Labeling" value="Rule-based portfolio labels" />
        <Info label="Output classes" value="Low, Medium, High" />
        <Info label="Deployment mode" value="Static JSON on GitHub Pages" />
      </dl>
      <div className="mt-5">
        <h3 className="text-sm font-semibold text-slate-700">Features used</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {features.map((feature) => (
            <span key={feature} className="rounded-md bg-panel px-2 py-1 text-xs text-slate-700 ring-1 ring-slate-200">
              {feature}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-5 text-sm leading-6 text-slate-600">
        The dashboard is designed for transparent portfolio demonstration. Replace demo terrain values with SRTM-derived statistics and validate labels with observed flood data before operational use.
      </p>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-panel p-3">
      <dt className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium text-ink">{value}</dd>
    </div>
  );
}
