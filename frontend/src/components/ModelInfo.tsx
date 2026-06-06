import { BrainCircuit } from "lucide-react";

export default function ModelInfo() {
  return (
    <section className="rounded-[18px] border border-white/60 bg-ink p-5 text-white shadow-[0_18px_50px_rgb(31_41_55_/_0.16)]">
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
        <h3 className="font-mono text-sm font-semibold text-white">Simplified risk formula</h3>
        <div className="mt-2 grid gap-2 text-sm text-white/75 sm:grid-cols-2">
          <Info label="No rain rule" value="0 mm 7-day rainfall sets flood risk to 0" />
          <Info label="Score mix" value="When rain exists: 38% rain, 17% humidity, 15% soil, 30% river flow" />
          <Info label="High risk" value="With rain: heavy rain, river flow >= 1.35x normal, or score >= 0.72" />
          <Info label="Medium risk" value="With rain: moderate rain, river flow >= 0.85x normal, or score >= 0.45" />
        </div>
      </div>
      <p className="mt-5 text-sm leading-6 text-white/75">
        The dashboard is designed for transparent portfolio demonstration. Cadasters without Open-Meteo calculations remain grey until weather rows are exported for their ACS_Code.
      </p>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] bg-black/20 p-3 ring-1 ring-white/20">
      <dt className="font-mono text-xs font-semibold text-white/60">{label}</dt>
      <dd className="mt-1 font-medium text-white">{value}</dd>
    </div>
  );
}
