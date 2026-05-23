export type RiskLabel = "Low" | "Medium" | "High";

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
  risk_label: RiskLabel;
  risk_score: number;
  main_drivers: string;
  recommended_action: string;
};
