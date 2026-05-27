export type RiskLabel = "Low" | "Medium" | "High";
export type MapMode = "current" | "rainy";

export type RainySeasonRecord = {
  ACS_Code: string;
  region_name?: string;
  month: string;
  rainfall_mm: number;
  avg_humidity: number;
  river_discharge: number;
  average_risk_score?: number;
  risk_label: RiskLabel;
  data_status?: "observed" | "estimated";
};

export type Prediction = {
  region_id: string;
  region_name: string;
  date: string;
  latitude: number;
  longitude: number;
  rainfall_1d: number;
  rainfall_3d: number;
  rainfall_7d: number;
  rainfall_14d: number;
  humidity_avg_3d: number;
  humidity_avg_7d: number;
  temperature_avg_7d: number;
  wind_avg_7d: number;
  elevation_mean: number;
  slope_mean: number;
  distance_to_river_km: number;
  soil_moisture_avg_7d?: number | null;
  river_discharge_max_7d?: number | null;
  river_discharge_mean_7d?: number | null;
  river_discharge_ratio?: number | null;
  risk_label: RiskLabel;
  risk_score: number;
  main_drivers: string;
  recommended_action: string;
};
