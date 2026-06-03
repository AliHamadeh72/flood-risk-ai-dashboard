const fs = require("fs");
const path = require("path");

const PREDICTIONS_FILE = path.join(process.cwd(), "data", "predictions", "risk_predictions.json");

const DATA_TERMS = [
  "cadaster",
  "cadasters",
  "region",
  "regions",
  "area",
  "areas",
  "risk",
  "score",
  "scores",
  "prediction",
  "predictions",
  "forecast",
  "rain",
  "rainfall",
  "driver",
  "drivers",
  "recommended action",
  "highest",
  "lowest",
  "top",
  "current",
  "dataset",
  "records",
  "map",
  "zoom",
  "select"
];

const STOPWORDS = new Set(["a", "about", "and", "are", "for", "give", "in", "is", "me", "of", "please", "show", "tell", "the", "to", "what", "which"]);
const PLACE_ALIASES = { beirut: ["beirut", "beyrouth"], beyrouth: ["beirut", "beyrouth"] };

const FLOOD_GUIDANCE = [
  "General flood safety guidance, based on American Red Cross recommendations:",
  "",
  "Before a flood: know your flood risk, prepare an emergency kit, protect important documents, and follow local alerts or evacuation instructions.",
  "During a flood: move to higher ground if told to evacuate, avoid walking or driving through floodwater, and stay away from fast-moving water and downed power lines.",
  "After a flood: return only when officials say it is safe, avoid contaminated floodwater, wear protective clothing during cleanup, and check for structural, electrical, or gas hazards before entering damaged buildings.",
  "",
  "For immediate danger, follow local emergency services and official evacuation orders."
].join("\n");

const SYSTEM_PROMPT = [
  "You are the Flood Risk AI Dashboard chatbot.",
  "Be friendly, concise, and conversational.",
  "For ordinary conversation, answer naturally.",
  "For flood-risk data questions, use only the supplied dashboard records.",
  "Never invent cadaster names, scores, rainfall values, alerts, or official emergency orders."
].join(" ");

let cachedPredictions;

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function predictions() {
  if (!cachedPredictions) {
    cachedPredictions = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, "utf8"));
  }
  return cachedPredictions;
}

function riskScore(record) {
  const score = Number(record.risk_score || 0);
  return Number.isFinite(score) ? score : 0;
}

function formatRecord(record) {
  return `${record.region_name} (cadaster ${record.region_id}): ${record.risk_label} risk, score ${Math.round(riskScore(record) * 100)}%, date ${record.date}, 7-day rainfall ${record.rainfall_7d} mm, drivers: ${record.main_drivers}, recommended action: ${record.recommended_action}`;
}

function mentionedCadaster(question) {
  const records = predictions();
  const codeMatch = question.match(/\b\d{3,}\b/);
  if (codeMatch) {
    const byCode = records.find((record) => String(record.region_id) === codeMatch[0]);
    if (byCode) return byCode;
  }

  const normalizedQuestion = ` ${normalizeText(question)} `;
  return [...records]
    .sort((a, b) => String(b.region_name).length - String(a.region_name).length)
    .find((record) => {
      const normalizedName = normalizeText(record.region_name);
      return normalizedName.length > 2 && normalizedQuestion.includes(` ${normalizedName} `);
    });
}

function placeMatches(question, limit = 5) {
  const queryTerms = normalizeText(question)
    .split(" ")
    .filter((term) => term.length > 2 && !STOPWORDS.has(term) && !DATA_TERMS.includes(term));
  const expandedTerms = new Set(queryTerms);
  for (const term of queryTerms) {
    for (const alias of PLACE_ALIASES[term] || []) expandedTerms.add(alias);
  }
  if (expandedTerms.size === 0) return [];

  return predictions()
    .map((record) => {
      const name = normalizeText(record.region_name);
      const score = [...expandedTerms].reduce((total, term) => total + (name.includes(term) ? 1 : 0), 0);
      return { record, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || riskScore(b.record) - riskScore(a.record))
    .slice(0, limit)
    .map((item) => item.record);
}

function isGuidanceRequest(question) {
  const normalized = normalizeText(question);
  const guidanceTerms = ["how", "should", "prepare", "before", "during", "after", "safety", "instruction", "instructions", "advice", "tips", "guide", "guidance", "evacuate"];
  const floodTerms = ["flood", "floods", "flooding", "water", "rain"];
  return guidanceTerms.some((term) => normalized.includes(term)) && floodTerms.some((term) => normalized.includes(term));
}

function isDataRequest(question) {
  const normalized = normalizeText(question);
  return Boolean(mentionedCadaster(question)) || /\b\d{3,}\b/.test(question) || DATA_TERMS.some((term) => normalized.includes(term));
}

function topRecords(question) {
  const records = predictions().filter((record) => String(record.region_name).toLowerCase() !== "conflict");
  const sorted = records.sort((a, b) => riskScore(b) - riskScore(a));
  return normalizeText(question).includes("lowest") ? sorted.reverse().slice(0, 5) : sorted.slice(0, 5);
}

function dataContext(question) {
  const records = predictions();
  const mentioned = mentionedCadaster(question);
  if (mentioned) return `Matched cadaster record:\n- ${formatRecord(mentioned)}`;

  const placeRecords = placeMatches(question);
  if (placeRecords.length) return `Matched place-name records:\n${placeRecords.map((record) => `- ${formatRecord(record)}`).join("\n")}`;

  const normalized = normalizeText(question);
  if (["highest", "top", "lowest"].some((term) => normalized.includes(term))) {
    const positiveCount = records.filter((record) => riskScore(record) > 0).length;
    const summary = positiveCount === 0 && !normalized.includes("lowest")
      ? "No cadaster currently has a positive flood-risk score in the loaded prediction records."
      : `${positiveCount} of ${records.length} records have a positive flood-risk score.`;
    return `${summary}\nRelevant records:\n${topRecords(question).map((record) => `- ${formatRecord(record)}`).join("\n")}`;
  }

  const highCount = records.filter((record) => record.risk_label === "High").length;
  const mediumCount = records.filter((record) => record.risk_label === "Medium").length;
  const lowCount = records.filter((record) => record.risk_label === "Low").length;
  return `Dataset summary: ${records.length} cadaster prediction records. Labels: ${highCount} High, ${mediumCount} Medium, ${lowCount} Low.`;
}

async function ollamaChat(messages) {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL || "llama3.1";
  const apiKey = process.env.OLLAMA_API_KEY;
  const allowWithoutKey = ["1", "true", "yes"].includes(String(process.env.USE_OLLAMA_WITHOUT_KEY || "").toLowerCase());

  if (!baseUrl || (!apiKey && !allowWithoutKey)) return null;

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({ model, stream: false, messages })
  });
  if (!response.ok) throw new Error(`Ollama request failed: ${response.status}`);
  const payload = await response.json();
  return payload?.message?.content || payload?.response || null;
}

function fallbackChat(question) {
  const normalized = normalizeText(question);
  if (["hello", "hi", "hey", "salam", "bonjour"].some((term) => normalized.split(" ").includes(term))) {
    return "Hello, I am the Flood Risk AI Dashboard chatbot. I can chat normally and look up cadaster flood-risk predictions when you ask for dashboard data.";
  }
  if (normalized.includes("thank") || normalized.includes("merci")) {
    return "You are welcome. Ask me about a cadaster, risk score, rainfall driver, or flood safety steps anytime.";
  }
  return "I can help with general conversation and flood-risk dashboard questions. Ask for a cadaster name, a risk score, the highest-risk areas, or flood safety guidance.";
}

async function answerQuestion(question, history = []) {
  const cleanQuestion = String(question || "").trim();
  if (!cleanQuestion) return "Please send a message.";
  if (isGuidanceRequest(cleanQuestion)) return FLOOD_GUIDANCE;

  const recentHistory = history
    .filter((message) => ["user", "assistant"].includes(message?.role) && String(message?.content || "").trim())
    .slice(-8);

  if (isDataRequest(cleanQuestion)) {
    const context = dataContext(cleanQuestion);
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...recentHistory,
      {
        role: "user",
        content: `Answer using only this dashboard context. Be natural and concise. Mention that this is planning data.\n\nDashboard context:\n${context}\n\nUser question: ${cleanQuestion}`
      }
    ];
    try {
      const llmAnswer = await ollamaChat(messages);
      if (llmAnswer) return llmAnswer;
    } catch {
      // Return grounded data below if the model endpoint is unavailable.
    }
    return `Here is what I found in the dashboard records:\n${context}\n\nUse this as planning data, not as an official emergency warning.`;
  }

  try {
    const llmAnswer = await ollamaChat([{ role: "system", content: SYSTEM_PROMPT }, ...recentHistory, { role: "user", content: cleanQuestion }]);
    if (llmAnswer) return llmAnswer;
  } catch {
    // Fall back to a useful built-in response.
  }
  return fallbackChat(cleanQuestion);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const answer = await answerQuestion(body.question, body.history || []);
    return res.status(200).json({ answer });
  } catch (error) {
    return res.status(500).json({ answer: "I could not process that message right now. Please try again." });
  }
};
