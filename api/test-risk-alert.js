const webpush = require("web-push");
const { deleteSubscription, getMongoDb, listSubscriptions } = require("./_pushStore");

const RISK_ORDER = {
  Low: 1,
  Medium: 2,
  High: 3
};

const setCors = (response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

const parseBody = (request) => {
  if (!request.body || typeof request.body !== "string") return request.body || {};
  try {
    return JSON.parse(request.body);
  } catch {
    return {};
  }
};

const normalizeRiskLevel = (level) => {
  const normalized = String(level || "").toLowerCase();
  if (normalized === "low") return "Low";
  if (normalized === "medium") return "Medium";
  if (normalized === "high") return "High";
  return "Low";
};

const riskValue = (level) => RISK_ORDER[normalizeRiskLevel(level)] || 0;

const riskRank = (level) => riskValue(level);

const configureWebPush = () => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:alerts@example.com";

  if (!publicKey || !privateKey) {
    throw new Error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be configured.");
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
};

const shouldNotifySubscription = (subscriptionRecord, alertType, riskLevel) => {
  const alertTypes = Array.isArray(subscriptionRecord.alertTypes) ? subscriptionRecord.alertTypes : ["flood"];
  const threshold = normalizeRiskLevel(subscriptionRecord.threshold || "High");
  return alertTypes.includes(alertType) && riskValue(riskLevel) >= riskValue(threshold);
};

const predictionId = (record) => `${record.region_id}:${record.date}`;

const normalizePrediction = (prediction) => {
  const regionId = String(prediction.region_id || prediction.regionId || "");
  const date = String(prediction.date || "");
  if (!regionId || !date) {
    throw new Error("prediction.region_id and prediction.date are required.");
  }

  return {
    ...prediction,
    _id: `${regionId}:${date}`,
    region_id: regionId,
    date,
    dateValue: Number.isNaN(new Date(date).getTime()) ? null : new Date(date)
  };
};

const sendHighRiskPush = async ({ alertType, currentRecord, previousRiskLevel, forceNotification = false }) => {
  configureWebPush();

  const currentRiskLevel = normalizeRiskLevel(currentRecord.risk_label);
  if (currentRiskLevel !== "High") {
    return { sent: 0, failed: 0, eligible: 0, reason: "Risk level is not High." };
  }

  if (!forceNotification && riskValue(currentRiskLevel) <= riskValue(previousRiskLevel)) {
    return { sent: 0, failed: 0, eligible: 0, reason: "Risk level did not increase." };
  }

  const notificationPayload = JSON.stringify({
    title: "High flood-risk dataset update",
    body: `${currentRecord.region_name || "Updated cadaster"} was updated to High flood risk in MongoDB.`,
    url: "/",
    region_id: currentRecord.region_id,
    region_name: currentRecord.region_name,
    risk_label: currentRiskLevel,
    tag: `mongo-flood-alert:${currentRecord.region_id}:${currentRecord.date}:${Date.now()}`
  });

  const subscriptions = await listSubscriptions();
  const eligibleSubscriptions = subscriptions.filter((subscription) => shouldNotifySubscription(subscription, alertType, currentRiskLevel));
  const results = await Promise.allSettled(
    eligibleSubscriptions.map((subscriptionRecord) =>
      webpush.sendNotification(subscriptionRecord.subscription, notificationPayload).catch(async (error) => {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await deleteSubscription(subscriptionRecord._id);
        }
        throw error;
      })
    )
  );

  const sent = results.filter((result) => result.status === "fulfilled").length;
  return {
    sent,
    failed: results.length - sent,
    eligible: eligibleSubscriptions.length,
    forced: forceNotification
  };
};

const saveOriginalSnapshot = async (db, snapshotId, originals) => {
  await db.collection("testRiskOverrides").updateOne(
    { _id: snapshotId },
    {
      $setOnInsert: {
        _id: snapshotId,
        ...originals,
        createdAt: new Date()
      },
      $set: {
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );
};

const triggerHighRisk = async (db, payload) => {
  const alertType = payload.alertType === "fire" ? "fire" : "flood";
  const prediction = normalizePrediction(payload.prediction || payload);
  const stateId = `${alertType}:${prediction.region_id}`;
  const now = new Date();
  const existingPrediction = await db.collection("cadasterRiskPredictions").findOne({ _id: prediction._id });
  const existingLatest = await db.collection("cadasterRiskLatest").findOne({ region_id: prediction.region_id });
  const existingRiskState = await db.collection("riskStates").findOne({ _id: stateId });
  const previousRiskLevel = normalizeRiskLevel(existingRiskState?.riskLevel || existingLatest?.risk_label || existingPrediction?.risk_label || payload.previousRiskLevel || "Low");

  await saveOriginalSnapshot(db, prediction._id, {
    alertType,
    predictionId: prediction._id,
    regionId: prediction.region_id,
    originalPrediction: existingPrediction,
    originalLatest: existingLatest,
    originalRiskState: existingRiskState
  });

  const mongoPrediction = {
    ...(existingPrediction || {}),
    ...prediction,
    risk_label: "High",
    risk_score: 1,
    rainfall_7d: Math.max(Number(prediction.rainfall_7d || 0), 28),
    main_drivers: prediction.main_drivers || "Manual MongoDB test alert",
    recommended_action: prediction.recommended_action || "Manual test alert generated from dashboard controls.",
    testOverride: true,
    testOverrideUpdatedAt: now,
    uploadedAt: existingPrediction?.uploadedAt || now
  };

  const latestPrediction = {
    ...(existingLatest || {}),
    ...mongoPrediction
  };

  await db.collection("cadasterRiskPredictions").replaceOne({ _id: mongoPrediction._id }, mongoPrediction, { upsert: true });
  await db.collection("cadasterRiskLatest").replaceOne({ _id: latestPrediction._id }, latestPrediction, { upsert: true });
  await db.collection("riskStates").replaceOne(
    { _id: stateId },
    {
      _id: stateId,
      alertType,
      regionId: prediction.region_id,
      riskLevel: "High",
      riskRank: riskRank("High"),
      riskScore: mongoPrediction.risk_score,
      date: mongoPrediction.date,
      testOverride: true,
      updatedAt: now
    },
    { upsert: true }
  );

  const push = await sendHighRiskPush({
    alertType,
    currentRecord: mongoPrediction,
    previousRiskLevel,
    forceNotification: true
  });

  return {
    ok: true,
    action: "trigger-high-risk",
    prediction: mongoPrediction,
    previousRiskLevel,
    mongoUpdated: true,
    push
  };
};

const restoreDocument = async (collection, filter, original) => {
  if (original) {
    await collection.replaceOne({ _id: original._id }, original, { upsert: true });
    return "restored";
  }

  await collection.deleteOne(filter);
  return "deleted";
};

const reverseHighRisk = async (db, payload) => {
  const prediction = normalizePrediction(payload.prediction || payload);
  const snapshot = await db.collection("testRiskOverrides").findOne({ _id: prediction._id });
  if (!snapshot) {
    return { ok: true, action: "reverse-high-risk", restored: false, reason: "No MongoDB test override snapshot found." };
  }

  const predictionStatus = await restoreDocument(db.collection("cadasterRiskPredictions"), { _id: snapshot.predictionId }, snapshot.originalPrediction);
  const latestStatus = await restoreDocument(
    db.collection("cadasterRiskLatest"),
    { region_id: snapshot.regionId },
    snapshot.originalLatest
  );
  const riskStateStatus = await restoreDocument(
    db.collection("riskStates"),
    { _id: `${snapshot.alertType}:${snapshot.regionId}` },
    snapshot.originalRiskState
  );
  await db.collection("testRiskOverrides").deleteOne({ _id: snapshot._id });

  return {
    ok: true,
    action: "reverse-high-risk",
    restored: true,
    statuses: {
      prediction: predictionStatus,
      latest: latestStatus,
      riskState: riskStateStatus
    }
  };
};

module.exports = async function handler(request, response) {
  setCors(response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST,OPTIONS");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const db = await getMongoDb();
    if (!db) throw new Error("MONGODB_URI is required for MongoDB-backed test alerts.");

    const payload = parseBody(request);
    const action = payload.action || "trigger-high-risk";
    const result = action === "reverse-high-risk" ? await reverseHighRisk(db, payload) : await triggerHighRisk(db, payload);
    response.status(200).json(result);
  } catch (error) {
    console.error("[test-risk-alert] failed", {
      message: error.message,
      name: error.name
    });
    response.status(500).json({ error: error.message || "Failed to update MongoDB-backed test alert." });
  }
};
