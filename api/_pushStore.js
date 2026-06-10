const { MongoClient } = require("mongodb");

const memoryStore = globalThis.__floodPushStore || {
  subscriptions: new Map(),
  riskStates: new Map()
};

globalThis.__floodPushStore = memoryStore;

let mongoClientPromise;

const getMongoDb = async () => {
  if (!process.env.MONGODB_URI) return null;

  if (!mongoClientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000
    });
    mongoClientPromise = client.connect();
  }

  let client;
  try {
    client = await mongoClientPromise;
  } catch (error) {
    mongoClientPromise = null;
    console.error("[push-store] MongoDB connection failed", {
      message: error.message,
      name: error.name
    });
    throw new Error("MongoDB connection failed. Check MONGODB_URI, Atlas IP access, and TLS connection string format.");
  }

  return client.db(process.env.MONGODB_DB || "flood-risk-ai-dashboard");
};

const getSubscriptionId = (subscription) => subscription?.endpoint;

const sanitizeAlertTypes = (alertTypes) => {
  const allowed = new Set(["flood", "fire"]);
  const values = Array.isArray(alertTypes) ? alertTypes : ["flood"];
  const sanitized = values.filter((type) => allowed.has(type));
  return sanitized.length ? sanitized : ["flood"];
};

const sanitizeThreshold = (threshold) => {
  const normalized = String(threshold || "High").toLowerCase();
  if (normalized === "low") return "Low";
  if (normalized === "medium") return "Medium";
  return "High";
};

const saveSubscription = async ({ subscription, alertTypes, threshold }) => {
  const id = getSubscriptionId(subscription);
  if (!id) throw new Error("Push subscription endpoint is required.");

  const record = {
    _id: id,
    subscription,
    alertTypes: sanitizeAlertTypes(alertTypes),
    threshold: sanitizeThreshold(threshold),
    updatedAt: new Date()
  };

  const db = await getMongoDb();
  if (db) {
    await db.collection("pushSubscriptions").updateOne({ _id: id }, { $set: record }, { upsert: true });
    return record;
  }

  memoryStore.subscriptions.set(id, record);
  return record;
};

const listSubscriptions = async () => {
  const db = await getMongoDb();
  if (db) return db.collection("pushSubscriptions").find({}).toArray();
  return [...memoryStore.subscriptions.values()];
};

const deleteSubscription = async (id) => {
  const db = await getMongoDb();
  if (db) {
    await db.collection("pushSubscriptions").deleteOne({ _id: id });
    return;
  }

  memoryStore.subscriptions.delete(id);
};

const getRiskState = async (id) => {
  const db = await getMongoDb();
  if (db) return db.collection("riskStates").findOne({ _id: id });
  return memoryStore.riskStates.get(id) || null;
};

const saveRiskState = async (id, state) => {
  const record = { _id: id, ...state, updatedAt: new Date() };
  const db = await getMongoDb();
  if (db) {
    await db.collection("riskStates").updateOne({ _id: id }, { $set: record }, { upsert: true });
    return record;
  }

  memoryStore.riskStates.set(id, record);
  return record;
};

const deleteRiskState = async (id) => {
  const db = await getMongoDb();
  if (db) {
    await db.collection("riskStates").deleteOne({ _id: id });
    return;
  }

  memoryStore.riskStates.delete(id);
};

module.exports = {
  deleteSubscription,
  deleteRiskState,
  getRiskState,
  listSubscriptions,
  saveRiskState,
  saveSubscription
};
