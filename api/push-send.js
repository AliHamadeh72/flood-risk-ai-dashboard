const webpush = require("web-push");
const { deleteSubscription, getRiskState, listSubscriptions, saveRiskState } = require("./_pushStore");

const RISK_ORDER = {
  Low: 1,
  Medium: 2,
  High: 3
};

const setCors = (response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

const normalizeRiskLevel = (level) => {
  const normalized = String(level || "").toLowerCase();
  if (normalized === "low") return "Low";
  if (normalized === "medium") return "Medium";
  if (normalized === "high") return "High";
  return "Low";
};

const riskValue = (level) => RISK_ORDER[normalizeRiskLevel(level)] || 0;

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

const parseBody = (request) => {
  if (!request.body || typeof request.body !== "string") return request.body || {};
  try {
    return JSON.parse(request.body);
  } catch {
    return {};
  }
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
    configureWebPush();

    const payload = parseBody(request);
    const alertType = payload.alertType === "fire" ? "fire" : "flood";
    const currentRiskLevel = normalizeRiskLevel(payload.riskLevel || payload.risk_label);
    const regionId = payload.regionId || payload.region_id || "unknown-region";
    const stateId = `${alertType}:${regionId}`;
    const previousState = await getRiskState(stateId);
    const previousRiskLevel = normalizeRiskLevel(payload.previousRiskLevel || previousState?.riskLevel || "Low");
    const increased = riskValue(currentRiskLevel) > riskValue(previousRiskLevel);

    await saveRiskState(stateId, {
      alertType,
      regionId,
      riskLevel: currentRiskLevel
    });

    if (currentRiskLevel !== "High") {
      response.status(200).json({ ok: true, sent: 0, reason: "Risk level is not High." });
      return;
    }

    if (!increased) {
      response.status(200).json({ ok: true, sent: 0, reason: "Risk level did not increase." });
      return;
    }

    const title = payload.title || "High flood-risk dataset update";
    const body =
      payload.body ||
      `${payload.regionName || payload.region_name || "Updated cadaster"} reached High ${alertType} risk.`;
    const notificationPayload = JSON.stringify({
      title,
      body,
      icon: payload.icon,
      badge: payload.badge,
      url: payload.url || "/",
      region_id: regionId,
      region_name: payload.regionName || payload.region_name,
      risk_label: currentRiskLevel,
      tag: payload.tag || `${alertType}:${regionId}:${payload.date || Date.now()}`
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
    const failed = results.length - sent;

    response.status(200).json({ ok: true, sent, failed, eligible: eligibleSubscriptions.length });
  } catch (error) {
    response.status(500).json({ error: error.message || "Failed to send push notifications" });
  }
};
