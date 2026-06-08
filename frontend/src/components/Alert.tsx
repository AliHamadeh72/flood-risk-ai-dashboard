import { useMemo, useState } from "react";
import { Bell, Check, X } from "lucide-react";
import type { Prediction } from "../types";

type AlertProps = {
  predictions: Prediction[];
  onHighlightRegion: (regionId: string) => void;
};

export default function Alert({ predictions, onHighlightRegion }: AlertProps) {
  const [showDesktopAlert, setShowDesktopAlert] = useState(true);

  const primaryAlert = useMemo(() => {
    const active = predictions
      .filter((item) => item.risk_label === "High")
      .sort((a, b) => b.risk_score - a.risk_score)
      [0];
    if (active) return active;
    return [...predictions].sort((a, b) => b.risk_score - a.risk_score)[0];
  }, [predictions]);

  if (!showDesktopAlert || !primaryAlert) return null;

  return (
    <aside
      className="popup alert-panel"
      role="alert"
      aria-live="assertive"
    >
      <div className="alert-panel__content">
        <span className="alert-panel__icon">
          <Bell className="alert-panel__icon-svg" />
        </span>
        <div className="alert-panel__message">
          <p>High risk alert in {primaryAlert.region_name}</p>
        </div>
        <button
          type="button"
          className="alert-panel__check"
          onClick={() => onHighlightRegion(primaryAlert.region_id)}
          title={`Highlight and zoom to ${primaryAlert.region_name}`}
          aria-label={`Highlight and zoom to ${primaryAlert.region_name}`}
        >
          <Check className="alert-panel__button-svg" />
        </button>
        <button
          type="button"
          className="alert-panel__close"
          onClick={() => setShowDesktopAlert(false)}
          title="Close alert"
          aria-label="Close alert"
        >
          <X className="alert-panel__button-svg" />
        </button>
      </div>
    </aside>
  );
}
