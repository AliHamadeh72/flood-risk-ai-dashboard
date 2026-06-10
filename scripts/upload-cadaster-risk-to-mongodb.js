const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_CADASTERS = path.join(ROOT, "data", "geo", "cadasters.geojson");
const DEFAULT_PREDICTIONS = path.join(ROOT, "data", "predictions", "risk_predictions.json");
const FORMULA_VERSION = "open-meteo-flood-risk-v1";

const loadDotEnv = (filePath) => {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const normalizeId = (value) => {
  if (value === null || value === undefined) return "";
  const number = Number(value);
  if (Number.isFinite(number) && Number.isInteger(number)) return String(number);
  return String(value);
};

const getRegionId = (properties) => normalizeId(properties.ACS_Code || properties.region_id);

const getRegionName = (properties, regionId) =>
  String(properties.Muni || properties.region_name || properties.District || properties.GOV || `Cadaster ${regionId}`);

const toDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const riskRank = (riskLabel) => {
  if (riskLabel === "High") return 3;
  if (riskLabel === "Medium") return 2;
  if (riskLabel === "Low") return 1;
  return 0;
};

const buildCadasterDocuments = (geojson, uploadedAt) =>
  geojson.features
    .map((feature) => {
      const properties = feature.properties || {};
      const regionId = getRegionId(properties);
      if (!regionId) return null;

      return {
        _id: regionId,
        region_id: regionId,
        region_name: getRegionName(properties, regionId),
        properties,
        geometry: feature.geometry || null,
        updatedAt: uploadedAt
      };
    })
    .filter(Boolean);

const buildPredictionDocuments = (predictions, uploadedAt) =>
  predictions.map((record) => {
    const regionId = normalizeId(record.region_id);
    const date = String(record.date || "");
    return {
      ...record,
      _id: `${regionId}:${date}`,
      region_id: regionId,
      date,
      dateValue: toDate(date),
      formulaVersion: FORMULA_VERSION,
      uploadedAt
    };
  });

const uniqueById = (documents) => [...new Map(documents.map((document) => [document._id, document])).values()];

const getLatestPredictions = (predictions) => {
  const latestByRegion = new Map();

  for (const record of predictions) {
    const regionId = normalizeId(record.region_id);
    const current = latestByRegion.get(regionId);
    if (!current || String(record.date || "") > String(current.date || "")) {
      latestByRegion.set(regionId, record);
    }
  }

  return [...latestByRegion.values()];
};

const bulkReplace = async (collection, documents) => {
  if (!documents.length) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };

  return collection.bulkWrite(
    documents.map((document) => ({
      replaceOne: {
        filter: { _id: document._id },
        replacement: document,
        upsert: true
      }
    })),
    { ordered: false }
  );
};

const createIndexes = async (db) => {
  await Promise.all([
    db.collection("cadasters").createIndex({ region_id: 1 }, { unique: true }),
    db.collection("cadasterRiskPredictions").createIndex({ region_id: 1, date: -1 }),
    db.collection("cadasterRiskPredictions").createIndex({ risk_label: 1, risk_score: -1 }),
    db.collection("cadasterRiskLatest").createIndex({ region_id: 1 }, { unique: true }),
    db.collection("cadasterRiskLatest").createIndex({ risk_label: 1, risk_score: -1 }),
    db.collection("riskStates").createIndex({ alertType: 1, regionId: 1 })
  ]);
};

const main = async () => {
  loadDotEnv(path.join(ROOT, ".env"));
  loadDotEnv(path.join(ROOT, ".env.local"));

  const mongoUri = process.env.MONGODB_URI;
  const databaseName = process.env.MONGODB_DB || "flood-risk-ai-dashboard";
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required. Set it in .env, .env.local, or the shell before running this script.");
  }

  const cadastersPath = process.argv.includes("--cadasters")
    ? path.resolve(process.argv[process.argv.indexOf("--cadasters") + 1])
    : DEFAULT_CADASTERS;
  const predictionsPath = process.argv.includes("--predictions")
    ? path.resolve(process.argv[process.argv.indexOf("--predictions") + 1])
    : DEFAULT_PREDICTIONS;

  const geojson = readJson(cadastersPath);
  const predictions = readJson(predictionsPath);
  const uploadedAt = new Date();

  const cadasters = uniqueById(buildCadasterDocuments(geojson, uploadedAt));
  const predictionDocuments = uniqueById(buildPredictionDocuments(predictions, uploadedAt));
  const latestPredictionDocuments = uniqueById(buildPredictionDocuments(getLatestPredictions(predictions), uploadedAt));
  const riskStates = latestPredictionDocuments.map((record) => ({
    _id: `flood:${record.region_id}`,
    alertType: "flood",
    regionId: record.region_id,
    riskLevel: record.risk_label,
    riskRank: riskRank(record.risk_label),
    riskScore: record.risk_score,
    date: record.date,
    formulaVersion: FORMULA_VERSION,
    updatedAt: uploadedAt
  }));

  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();

  try {
    const db = client.db(databaseName);
    await createIndexes(db);

    const cadasterResult = await bulkReplace(db.collection("cadasters"), cadasters);
    const predictionResult = await bulkReplace(db.collection("cadasterRiskPredictions"), predictionDocuments);
    const latestResult = await bulkReplace(db.collection("cadasterRiskLatest"), latestPredictionDocuments);
    const riskStateResult = await bulkReplace(db.collection("riskStates"), riskStates);

    await db.collection("pipelineRuns").insertOne({
      type: "cadaster-risk-upload",
      formulaVersion: FORMULA_VERSION,
      sourceFiles: {
        cadasters: path.relative(ROOT, cadastersPath),
        predictions: path.relative(ROOT, predictionsPath)
      },
      counts: {
        cadasters: cadasters.length,
        predictions: predictionDocuments.length,
        latestPredictions: latestPredictionDocuments.length,
        riskStates: riskStates.length
      },
      results: {
        cadasters: cadasterResult,
        predictions: predictionResult,
        latestPredictions: latestResult,
        riskStates: riskStateResult
      },
      createdAt: uploadedAt
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          database: databaseName,
          formulaVersion: FORMULA_VERSION,
          counts: {
            cadasters: cadasters.length,
            predictions: predictionDocuments.length,
            latestPredictions: latestPredictionDocuments.length,
            riskStates: riskStates.length
          }
        },
        null,
        2
      )
    );
  } finally {
    await client.close();
  }
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
