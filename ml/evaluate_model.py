from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
METRICS_FILE = ROOT / "ml" / "model" / "metrics.json"


def main() -> None:
    metrics = json.loads(METRICS_FILE.read_text(encoding="utf-8"))
    print(f"Model: {metrics['model_type']}")
    print(f"Accuracy: {metrics['accuracy']:.3f}")
    print("Labels:", ", ".join(metrics["labels"]))
    print("Confusion matrix:")
    for row in metrics["confusion_matrix"]:
        print(row)


if __name__ == "__main__":
    main()
