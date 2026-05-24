from __future__ import annotations

import argparse
from pathlib import Path

import geopandas as gpd

from fetch_open_meteo_cadasters import DEFAULT_CADASTERS_DIR, PipelineError, find_shapefile


ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DATA = ROOT / "frontend" / "src" / "data"
DATA_GEO = ROOT / "data" / "geo"


def normalize_acs_code(value: object) -> str:
    try:
        number = float(value)
        if number.is_integer():
            return str(int(number))
    except (TypeError, ValueError):
        pass
    return str(value)


def export_cadasters(cadasters_dir: Path, simplify_tolerance: float) -> gpd.GeoDataFrame:
    shapefile = find_shapefile(cadasters_dir)
    cadasters = gpd.read_file(shapefile)
    if "ACS_Code" not in cadasters.columns:
        raise PipelineError(f"ACS_Code field is missing from shapefile: {shapefile}")
    if cadasters.crs is None:
        raise PipelineError("Shapefile CRS is missing; define the source CRS before exporting cadasters.")

    keep_columns = [column for column in ["ACS_Code", "GOV", "District", "Muni"] if column in cadasters.columns]
    cadasters = cadasters[keep_columns + ["geometry"]].copy().to_crs(epsg=4326)
    cadasters["ACS_Code"] = cadasters["ACS_Code"].map(normalize_acs_code)
    cadasters["region_id"] = cadasters["ACS_Code"]
    cadasters["region_name"] = cadasters.get("Muni", cadasters["ACS_Code"]).fillna(cadasters["ACS_Code"])

    if simplify_tolerance > 0:
        cadasters["geometry"] = cadasters.geometry.simplify(simplify_tolerance, preserve_topology=True)

    return cadasters


def main() -> None:
    parser = argparse.ArgumentParser(description="Export Lebanon cadasters as frontend-ready GeoJSON.")
    parser.add_argument("--cadasters-dir", type=Path, default=DEFAULT_CADASTERS_DIR)
    parser.add_argument("--simplify-tolerance", type=float, default=0.0008)
    args = parser.parse_args()

    try:
        cadasters = export_cadasters(args.cadasters_dir, args.simplify_tolerance)
    except PipelineError as exc:
        raise SystemExit(f"ERROR: {exc}") from exc

    FRONTEND_DATA.mkdir(parents=True, exist_ok=True)
    DATA_GEO.mkdir(parents=True, exist_ok=True)
    frontend_output = FRONTEND_DATA / "cadasters.json"
    data_output = DATA_GEO / "cadasters.geojson"
    cadasters.to_file(frontend_output, driver="GeoJSON")
    cadasters.to_file(data_output, driver="GeoJSON")
    print(f"Wrote {frontend_output} and {data_output} with {len(cadasters)} cadasters")


if __name__ == "__main__":
    main()
