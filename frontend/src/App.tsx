import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const API = import.meta.env.VITE_API_BASE as string; // e.g. http://localhost:3001

interface Bar {
  t: string | number | Date;
  c: number;
}

interface SignalPoint {
  value?: number | null;
}

interface Signals {
  sma20?: SignalPoint[];
  rsi14?: SignalPoint[];
  [key: string]: SignalPoint[] | undefined;
}

export default function App(): JSX.Element {
  const [symbol, setSymbol] = useState<string>("AAPL");
  const [symbolHolder, setSymbolHolder] = useState<string>("AAPL");
  const [data, setData] = useState<{ date: string; close: number }[]>([]);
  const [signals, setSignals] = useState<Signals | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string>("");

  async function load(sym: string): Promise<void> {
    setLoading(true);
    setErr("");
    try {
      const [pRes, sRes] = await Promise.all([
        fetch(`${API}/api/series?symbol=${encodeURIComponent(sym)}`),
        fetch(`${API}/api/signals?symbol=${encodeURIComponent(sym)}`),
      ]);

      if (!pRes.ok) throw new Error(await pRes.text());
      const bars: Bar[] = await pRes.json();

      const rows = bars.map((b) => ({
        date: new Date(b.t).toISOString().slice(0, 10),
        close: +b.c,
      }));
      setData(rows);

      if (sRes.ok) setSignals(await sRes.json());
      else setSignals(null);
    } catch (e: any) {
      setErr(String(e.message || e));
      setData([]);
      setSignals(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(symbol);
  }, []); // initial load

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 28 }}>📈 {symbolHolder} Daily Close</h1>

      <div style={{ display: "flex", gap: 12, margin: "14px 0 18px" }}>
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          style={{ padding: "10px 12px" }}
        />
        <button
          onClick={() => {
            load(symbol);
            setSymbolHolder(symbol);
          }}
        >
          Load
        </button>
      </div>

      {err && <div style={{ color: "#fca5a5" }}>Error: {err}</div>}
      {loading && <div>Loading…</div>}

      {!loading && data.length > 0 && (
        <div
          style={{
            height: 420,
            background: "#0f1115",
            border: "1px solid #1f2937",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis
                dataKey="date"
                minTickGap={40}
                tick={{ fill: "#9ca3af" }}
              />
              <YAxis tick={{ fill: "#9ca3af" }} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  background: "#000000",
                  border: "1px solid #ffffff",
                  borderRadius: 12,
                }}
                labelStyle={{ color: "#e5e7eb" }}
                itemStyle={{ color: "#e5e7eb" }}
              />
              <Line
                type="monotone"
                dataKey="close"
                stroke="#ffffff"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {signals && (
        <div style={{ marginTop: 10, opacity: 0.8, fontSize: 12 }}>
          SMA20 last:{" "}
          {signals.sma20?.at(-1)?.value?.toFixed(2) ?? "--"} | RSI14 last:{" "}
          {signals.rsi14?.at(-1)?.value?.toFixed(1) ?? "--"}
        </div>
      )}
   
      <footer style={{ marginTop: 18, opacity: 0.6, fontSize: 12 }}>
        Gateway: {API}
      </footer>
    </div>
  );
}
