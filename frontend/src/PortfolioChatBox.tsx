import { JSX, useEffect, useMemo, useState } from "react";
import type { SavedStockDoc } from "./SavedStockCard";

const API = import.meta.env.VITE_API_BASE as string;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type PortfolioAnalysisResponse = {
  generatedAt?: string;
  holdings?: any[];
  analysis?: string;
  warnings?: string[];
};

type PortfolioChatResponse = {
  answer?: string;
  warnings?: string[];
};

type Props = {
  holdings: SavedStockDoc[];
};

export default function PortfolioChatBox({ holdings }: Props): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  const symbols = useMemo(
    () => holdings.map((h) => h.symbol).filter(Boolean),
    [holdings]
  );

  async function loadInitialAnalysis(): Promise<void> {
    setLoadingSummary(true);
    setErr("");

    try {
      const r = await fetch(`${API}/api/portfolio-analysis`);
      if (!r.ok) throw new Error(await r.text());

      const data: PortfolioAnalysisResponse = await r.json();

      setMessages([
        {
          role: "assistant",
          content:
            data.analysis?.trim() ||
            "I looked at your saved holdings, but no analysis was returned.",
        },
      ]);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setMessages([
        {
          role: "assistant",
          content:
            "I couldn’t load the portfolio analysis yet. Try refreshing or ask a question below.",
        },
      ]);
    } finally {
      setLoadingSummary(false);
    }
  }

  async function handleSend(): Promise<void> {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setSending(true);
    setErr("");

    try {
      const r = await fetch(`${API}/api/portfolio-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmed,
          symbols,
        }),
      });

      if (!r.ok) throw new Error(await r.text());

      const data: PortfolioChatResponse = await r.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer?.trim() || "I got an empty reply back.",
        },
      ]);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong when I tried to answer that.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    loadInitialAnalysis();
  }, []);

  return (
    <section className="savedCard portfolioChatCard">
      <div className="savedTopRow portfolioChatTopRow">
        <div className="portfolioChatHeaderBlock">
          <div className="savedSymbol">Portfolio Assistant</div>
          <div className="savedMeta">
            {symbols.length > 0
              ? `Watching ${symbols.join(", ")}`
              : "No saved holdings yet"}
          </div>
          <div className="portfolioChatHint">
            Ask about trend, momentum, strongest holding, weakest holding, or overall risk.
          </div>
        </div>

        <button
          className="showMoreBtn"
          onClick={loadInitialAnalysis}
          disabled={loadingSummary}
        >
          {loadingSummary ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {loadingSummary && <div className="loading-text">Loading analysis…</div>}
      {err && <div className="error-text">Error: {err}</div>}

      <div className="portfolioChatMessages">
        {messages.length === 0 && !loadingSummary ? (
          <div className="portfolioChatEmpty">
            <div className="savedMetricLabel">Assistant</div>
            <div className="savedMetricValue">
              Your portfolio summary will appear here.
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={`${msg.role}-${idx}`}
              className={`portfolioChatBubble ${msg.role}`}
            >
              <div className="savedMetricLabel">
                {msg.role === "user" ? "You" : "Assistant"}
              </div>
              <div className="savedMetricValue portfolioChatText">
                {msg.content}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="portfolioChatComposer">
        <input
          className="symbol-input portfolioChatInput"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your saved stocks..."
          disabled={sending}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSend();
            }
          }}
        />

        <button
          className="load-button portfolioChatSendButton"
          onClick={handleSend}
          disabled={sending || !input.trim()}
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </section>
  );
}