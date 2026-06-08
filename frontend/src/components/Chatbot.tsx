import { useMemo, useState } from "react";
import { Bot, Send, UserRound } from "lucide-react";
import type { Prediction } from "../types";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type CadasterLookup = {
  byCode: Map<string, Prediction>;
  byNameLength: Prediction[];
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function createCadasterLookup(predictions: Prediction[]): CadasterLookup {
  return {
    byCode: new Map(predictions.map((record) => [record.region_id, record])),
    byNameLength: [...predictions].sort((a, b) => b.region_name.length - a.region_name.length)
  };
}

function findMentionedCadaster(query: string, lookup: CadasterLookup): Prediction | null {
  const normalizedQuery = ` ${normalizeText(query)} `;
  const codeMatch = query.match(/\b\d{3,}\b/);
  if (codeMatch) {
    const byCode = lookup.byCode.get(codeMatch[0]);
    if (byCode) return byCode;
  }

  return (
    lookup.byNameLength.find((record) => {
      const normalizedName = normalizeText(record.region_name);
      return normalizedName.length > 2 && normalizedQuery.includes(` ${normalizedName} `);
    }) ?? null
  );
}

function fallbackAnswer(question: string, lookup: CadasterLookup): string {
  const mentioned = findMentionedCadaster(question, lookup);
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
  const cadasterLookup = useMemo(() => createCadasterLookup(predictions), [predictions]);

  async function submit() {
    const question = input.trim();
    if (!question || isSending) return;

    const userMessage: Message = { role: "user", content: question };
    const nextMessages = [...messages, userMessage];
    const mentionedCadaster = findMentionedCadaster(question, cadasterLookup);
    if (mentionedCadaster) {
      onSelectRegion(mentionedCadaster.region_id);
    }

    setIsSending(true);
    setMessages(nextMessages);
    setInput("");

    const backendUrl = import.meta.env.VITE_BACKEND_API_URL;
    const chatEndpoint = backendUrl ? `${backendUrl.replace(/\/$/, "")}/chat` : "/api/chat";
    try {
      const response = await fetch(chatEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          history: messages.slice(-8)
        })
      });
      if (!response.ok) throw new Error("Backend chat request failed");

      const payload = (await response.json()) as { answer?: string };
      setMessages((current) => [...current, { role: "assistant", content: payload.answer ?? fallbackAnswer(question, cadasterLookup) }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", content: fallbackAnswer(question, cadasterLookup) }]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex min-h-[360px] flex-col rounded-[18px] border border-white/60 bg-white/90 shadow-[0_18px_50px_rgb(31_41_55_/_0.12)] backdrop-blur-md sm:min-h-[430px]">
      <div className="mobile-scroll flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            {message.role === "assistant" && <Bot className="mt-1 h-5 w-5 flex-none text-river" />}
            <p className={`max-w-[82%] whitespace-pre-line rounded-[18px] px-3 py-2 text-sm ${message.role === "user" ? "bg-ink text-white" : "bg-panel text-ink ring-1 ring-white/70"}`}>
              {message.content}
            </p>
            {message.role === "user" && <UserRound className="mt-1 h-5 w-5 flex-none text-bluewave" />}
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-white/70 bg-panel/80 p-3">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          placeholder={isSending ? "Retrieving context..." : "Which regions are high risk?"}
          className="min-w-0 flex-1 rounded-full border border-bluewave/50 bg-white px-4 py-2 text-sm outline-none focus:border-river focus:ring-4 focus:ring-river/20"
        />
        <button disabled={isSending} onClick={submit} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-river text-white hover:bg-bluewave disabled:cursor-wait disabled:opacity-60" title="Send question">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
