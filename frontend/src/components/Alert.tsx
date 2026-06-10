import { useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { Prediction } from "../types";

type AlertProps = {
  predictions: Prediction[];
  onHighlightRegion: (regionId: string) => void;
};

export default function Alert({ predictions, onHighlightRegion }: AlertProps) {
  const [showDesktopAlert, setShowDesktopAlert] = useState(true);

  const primaryAlert = useMemo(() => {
    let latestDate = "";
    let active: Prediction | undefined;

    for (const item of predictions) {
      if (item.date > latestDate) latestDate = item.date;
    }

    for (const item of predictions) {
      if (item.date !== latestDate || item.risk_label !== "High") continue;
      if (!active || item.risk_score > active.risk_score) active = item;
    }

    return active;
  }, [predictions]);

  if (!showDesktopAlert || !primaryAlert) return null;

  const isHighRisk = primaryAlert.risk_label === "High";
  const alertTone = isHighRisk ? "flood-alert--danger" : primaryAlert.risk_score > 0 ? "flood-alert--info" : "flood-alert--success";
  const handleCheck = () => {
    onHighlightRegion(primaryAlert.region_id);
    setShowDesktopAlert(false);
  };

  return (
    <aside
      className={`flood-alert ${alertTone}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="square_box box_three" aria-hidden="true" />
      <div className="square_box box_four" aria-hidden="true" />
      <div className="flood-alert__content">
        <span className="flood-alert__mark" aria-hidden="true">
          <AlertTriangle className="flood-alert__icon-svg" />
        </span>
        <div className="flood-alert__message">
          <p>
            <strong>{isHighRisk ? "Oh snap!" : "Heads up!"}</strong>{" "}
            {isHighRisk ? "High flood-risk signal" : "Flood-risk signal"} in {primaryAlert.region_name}.
          </p>
          <span className="flood-alert__meta">
            Score {Math.round(primaryAlert.risk_score * 100)}% - {primaryAlert.rainfall_7d} mm rain
          </span>
        </div>
        <button
          type="button"
          className="flood-alert__check"
          onClick={handleCheck}
          title={`Highlight and zoom to ${primaryAlert.region_name}`}
          aria-label={`Highlight and zoom to ${primaryAlert.region_name}`}
        >
          Check
        </button>
        <button
          type="button"
          className="flood-alert__close"
          onClick={() => setShowDesktopAlert(false)}
          title="Close alert"
          aria-label="Close alert"
        >
          <X className="flood-alert__button-svg" />
        </button>
      </div>
    </aside>
  );
}
