import { BrainCircuit } from "lucide-react";

export default function ModelInfo() {
  return (
    <section className="rounded-md border border-bluewave/60 bg-[#DBEAFE] p-5 shadow-sm">
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
        <h3 className="text-sm font-semibold text-ink">Simplified risk formula</h3>
        <div className="mt-2 grid gap-2 text-sm text-ink/75 sm:grid-cols-2">
          <Info label="No rain rule" value="0 mm 7-day rainfall sets flood risk to 0" />
          <Info label="Score mix" value="When rain exists: 38% rain, 17% humidity, 15% soil, 30% river flow" />
          <Info label="High risk" value="With rain: heavy rain, river flow >= 1.35x normal, or score >= 0.72" />
          <Info label="Medium risk" value="With rain: moderate rain, river flow >= 0.85x normal, or score >= 0.45" />
        </div>
      </div>
      <p className="mt-5 text-sm leading-6 text-ink/75">
        The dashboard is designed for transparent portfolio demonstration. Cadasters without Open-Meteo calculations remain grey until weather rows are exported for their ACS_Code.
      </p>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white p-3 ring-1 ring-bluewave/30">
      <dt className="text-xs font-semibold uppercase tracking-normal text-ink/65">{label}</dt>
      <dd className="mt-1 font-medium text-ink">{value}</dd>
    </div>
  );
}
