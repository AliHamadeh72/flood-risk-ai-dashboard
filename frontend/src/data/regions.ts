const regions = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { region_id: "LB-BEY-001", region_name: "Beirut River Area" },
      geometry: { type: "Polygon", coordinates: [[[35.515, 33.895], [35.545, 33.895], [35.545, 33.875], [35.515, 33.875], [35.515, 33.895]]] }
    },
    {
      type: "Feature",
      properties: { region_id: "LB-TRI-001", region_name: "Tripoli Coastal Plain" },
      geometry: { type: "Polygon", coordinates: [[[35.825, 34.455], [35.875, 34.455], [35.875, 34.425], [35.825, 34.425], [35.825, 34.455]]] }
    },
    {
      type: "Feature",
      properties: { region_id: "LB-SAI-001", region_name: "Saida Coastal Basin" },
      geometry: { type: "Polygon", coordinates: [[[35.345, 33.585], [35.395, 33.585], [35.395, 33.545], [35.345, 33.545], [35.345, 33.585]]] }
    },
    {
      type: "Feature",
      properties: { region_id: "LB-ZAH-001", region_name: "Zahle Valley" },
      geometry: { type: "Polygon", coordinates: [[[35.855, 33.875], [35.925, 33.875], [35.925, 33.825], [35.855, 33.825], [35.855, 33.875]]] }
    },
    {
      type: "Feature",
      properties: { region_id: "LB-TYR-001", region_name: "Tyre Coastal Lowlands" },
      geometry: { type: "Polygon", coordinates: [[[35.175, 33.295], [35.235, 33.295], [35.235, 33.245], [35.175, 33.245], [35.175, 33.295]]] }
    },
    {
      type: "Feature",
      properties: { region_id: "LB-JBE-001", region_name: "Jbeil Hills" },
      geometry: { type: "Polygon", coordinates: [[[35.625, 34.145], [35.705, 34.145], [35.705, 34.095], [35.625, 34.095], [35.625, 34.145]]] }
    }
  ]
} as const;

export default regions;
