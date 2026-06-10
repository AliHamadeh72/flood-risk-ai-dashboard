const { deleteSubscription, saveSubscription } = require("./_pushStore");

const setCors = (response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST,DELETE,OPTIONS");
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

module.exports = async function handler(request, response) {
  setCors(response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  try {
    const body = parseBody(request);

    if (request.method === "POST") {
      const { subscription, alertTypes, threshold } = body;
      const record = await saveSubscription({ subscription, alertTypes, threshold });
      response.status(200).json({
        ok: true,
        endpoint: record._id,
        alertTypes: record.alertTypes,
        threshold: record.threshold
      });
      return;
    }

    if (request.method === "DELETE") {
      const { endpoint } = body;
      if (!endpoint) {
        response.status(400).json({ error: "endpoint is required" });
        return;
      }

      await deleteSubscription(endpoint);
      response.status(200).json({ ok: true });
      return;
    }

    response.setHeader("Allow", "POST,DELETE,OPTIONS");
    response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    response.status(500).json({ error: error.message || "Failed to save push subscription" });
  }
};
