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

  return (
    [...predictions]
      .sort((a, b) => b.region_name.length - a.region_name.length)
      .find((record) => {
        const normalizedName = normalizeText(record.region_name);
        return normalizedName.length > 2 && normalizedQuery.includes(` ${normalizedName} `);
      }) ?? null
  );
}

function fallbackAnswer(question: string, predictions: Prediction[]): string {
  const mentioned = findMentionedCadaster(question, predictions);
  if (mentioned) {
    return [
      `I found ${mentioned.region_name} in the local dashboard data.`,
      `Current risk: ${mentioned.risk_label}, score ${Math.round(mentioned.risk_score * 100)}%.`,
      `7-day rainfall: ${mentioned.rainfall_7d} mm. Drivers: ${mentioned.main_drivers}.`,
      `Recommended action: ${mentioned.recommended_action}`,
      "",
      "The backend chatbot is unavailable, so this is a local fallback answer."
    ].join("\n");
  }

  return [
    "I could not reach the Ollama-backed chatbot service.",
    "When the backend is running, I can chat normally and extract flood-risk records when you ask for dashboard data."
  ].join("\n");
}

export default function Chatbot({ predictions, onSelectRegion }: { predictions: Prediction[]; onSelectRegion: (regionId: string) => void }) {
  const starter = useMemo<Message[]>(
    () => [
      {
        role: "assistant",
        content: "Hi, I am the Flood Risk AI chatbot. You can chat with me normally, or ask me for cadaster flood-risk data."
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

    const userMessage: Message = { role: "user", content: question };
    const nextMessages = [...messages, userMessage];
    const mentionedCadaster = findMentionedCadaster(question, predictions);
    if (mentionedCadaster) {
      onSelectRegion(mentionedCadaster.region_id);
    }

    setIsSending(true);
    setMessages(nextMessages);
    setInput("");

    const backendUrl = import.meta.env.VITE_BACKEND_API_URL ?? "http://localhost:8000";
    try {
      const response = await fetch(`${backendUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          history: messages.slice(-8)
        })
      });
      if (!response.ok) throw new Error("Backend chat request failed");

      const payload = (await response.json()) as { answer?: string };
      setMessages((current) => [...current, { role: "assistant", content: payload.answer ?? fallbackAnswer(question, predictions) }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", content: fallbackAnswer(question, predictions) }]);
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
          placeholder={isSending ? "Thinking..." : "Say hello, or ask about a cadaster risk"}
          className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-river"
        />
        <button disabled={isSending} onClick={submit} className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-river text-white hover:bg-[#185d70] disabled:cursor-wait disabled:opacity-60" title="Send message">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
