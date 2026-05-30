import { useMemo, useState } from "react";
import { Bot, Send, UserRound } from "lucide-react";
import type { Prediction } from "../types";

type Message = {
  role: "user" | "assistant";
  content: string;
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findMentionedCadaster(query: string, predictions: Prediction[]): Prediction | null {
  const normalizedQuery = ` ${normalizeText(query)} `;
  const codeMatch = query.match(/\b\d{3,}\b/);
  if (codeMatch) {
    const byCode = predictions.find((record) => record.region_id === codeMatch[0]);
    if (byCode) return byCode;
  }

  return [...predictions]
    .sort((a, b) => b.region_name.length - a.region_name.length)
    .find((record) => {
      const normalizedName = normalizeText(record.region_name);
      return normalizedName.length > 2 && normalizedQuery.includes(` ${normalizedName} `);
    }) ?? null;
}

function scoreRecord(query: string, record: Prediction): number {
  const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
  const text = `${record.region_name} ${record.risk_label} ${record.main_drivers} ${record.recommended_action}`.toLowerCase();
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

function answerFromRecords(query: string, predictions: Prediction[]): string {
  const mentioned = findMentionedCadaster(query, predictions);
  if (mentioned) {
    return `Based only on retrieved project records:\n${mentioned.region_name}: ${mentioned.risk_label} risk, ${mentioned.rainfall_7d} mm 7-day rainfall, risk score ${Math.round(mentioned.risk_score * 100)}%, drivers: ${mentioned.main_drivers}. Action: ${mentioned.recommended_action}\n\nI focused the map and charts on this cadaster. Use this for planning support only, not official emergency instructions.`;
  }

  const matches = [...predictions]
    .map((record) => ({ record, score: scoreRecord(query, record) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.record.risk_score - a.record.risk_score)
    .slice(0, 3)
    .map((item) => item.record);

  if (matches.length === 0) {
    return "The requested information is unavailable in the current flood-risk records.";
  }

  const highRiskCount = predictions.filter((item) => item.risk_label === "High").length;
  const contextLines = matches
    .map(
      (item) =>
        `${item.region_name}: ${item.risk_label} risk, ${item.rainfall_7d} mm 7-day rainfall, drivers: ${item.main_drivers}. Action: ${item.recommended_action}`
    )
    .join("\n");

  return `Based only on retrieved project records:\n${contextLines}\n\nCurrent dataset summary: ${highRiskCount} of ${predictions.length} regions are High risk. Use this for planning support only, not official emergency instructions.`;
}

export default function Chatbot({ predictions, onSelectRegion }: { predictions: Prediction[]; onSelectRegion: (regionId: string) => void }) {
  const starter = useMemo<Message[]>(
    () => [
      {
        role: "assistant",
        content: "Ask about high-risk areas, rainfall drivers, or recommended planning actions. I will answer only from the current prediction records."
      }
    ],
    []
  );
  const [messages, setMessages] = useState<Message[]>(starter);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function submit() {
    const question = input.trim();
    if (!question || isSending) return;
    setIsSending(true);
    setMessages((current) => [...current, { role: "user", content: question }]);
    setInput("");
    const mentionedCadaster = findMentionedCadaster(question, predictions);
    if (mentionedCadaster) {
      onSelectRegion(mentionedCadaster.region_id);
    }

    const backendUrl = import.meta.env.VITE_BACKEND_API_URL ?? "http://localhost:8000";
    try {
      const response = await fetch(`${backendUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });
      if (!response.ok) throw new Error("Backend chat request failed");
      const payload = (await response.json()) as { answer?: string };
      setMessages((current) => [...current, { role: "assistant", content: payload.answer ?? answerFromRecords(question, predictions) }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", content: answerFromRecords(question, predictions) }]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex min-h-[430px] flex-col rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            {message.role === "assistant" && <Bot className="mt-1 h-5 w-5 flex-none text-river" />}
            <p className={`max-w-[82%] whitespace-pre-line rounded-md px-3 py-2 text-sm ${message.role === "user" ? "bg-river text-white" : "bg-panel text-ink"}`}>
              {message.content}
            </p>
            {message.role === "user" && <UserRound className="mt-1 h-5 w-5 flex-none text-slate-500" />}
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-slate-200 p-3">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          placeholder={isSending ? "Retrieving context..." : "Which regions are high risk?"}
          className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-river"
        />
        <button disabled={isSending} onClick={submit} className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-river text-white hover:bg-[#185d70] disabled:cursor-wait disabled:opacity-60" title="Send question">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
