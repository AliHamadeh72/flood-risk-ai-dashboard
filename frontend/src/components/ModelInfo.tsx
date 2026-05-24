import { BrainCircuit } from "lucide-react";

export default function ModelInfo() {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <BrainCircuit className="h-5 w-5 text-river" />
        <h2 className="text-lg font-semibold">Model Info</h2>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Info label="Model type" value="Open-Meteo weather + flood scoring" />
        <Info label="Labeling" value="Weather and river-discharge thresholds" />
        <Info label="Output classes" value="Low, Medium, High" />
        <Info label="Deployment mode" value="Static JSON on GitHub Pages" />
      </dl>
      <div className="mt-5">
        <h3 className="text-sm font-semibold text-slate-700">Simplified risk formula</h3>
        <div className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          <Info label="Score mix" value="38% rain, 17% humidity, 15% soil, 30% river flow" />
          <Info label="High risk" value="Heavy rain, river flow >= 1.35x normal, or score >= 0.72" />
          <Info label="Medium risk" value="Moderate rain, river flow >= 0.85x normal, or score >= 0.45" />
          <Info label="Low risk" value="Below medium thresholds with routine monitoring" />
        </div>
      </div>
      <p className="mt-5 text-sm leading-6 text-slate-600">
        The dashboard is designed for transparent portfolio demonstration. Cadasters without Open-Meteo calculations remain grey until weather rows are exported for their ACS_Code.
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
