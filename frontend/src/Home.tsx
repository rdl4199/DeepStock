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
import SignalBox from "./SignalBox.tsx";
import "../styles/App.css";
import HamburgerMenu from "./HamburgerMenu.tsx";

const API = import.meta.env.VITE_API_BASE as string;

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

export default function Home(): JSX.Element {
  const [symbol, setSymbol] = useState("AAPL");
  const [symbolHolder, setSymbolHolder] = useState("AAPL");
  const [data, setData] = useState<{ date: string; close: number }[]>([]);
  const [signals, setSignals] = useState<Signals | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

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

      if (sRes.ok) 
      {
        setSignals(await sRes.json());
      }
      else 
      {
        setSignals(null);
      }
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
  }, []);

  return (
    <div>
      <HamburgerMenu items={[{ label: "Homeeeee", href: "/" }, { label: "Saved", href: "/saved" }]} />
      <div className="app-container">
        <h1 className="app-title">📈 {symbolHolder} Daily Close</h1>

        <div className="symbol-controls">
          <input
            className="symbol-input"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          />
          <button
            className="load-button"
            onClick={() => {
              load(symbol);
              setSymbolHolder(symbol);
            }}
          >
            Load
          </button>
        </div>

        {err && <div className="error-text">Error: {err}</div>}
        {loading && <div className="loading-text">Loading…</div>}

        {!loading && data.length > 0 && (
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" minTickGap={40} tick={{ fill: "#9ca3af" }} />
                <YAxis tick={{ fill: "#9ca3af" }} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{
                    background: "#000000",
                    border: "1px solid #ffffff",
                    borderRadius: 12,
                  }}
                  wrapperClassName="tooltip"
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
          <div className="signals-container">
            <SignalBox label="Price data" display={`Last close: ${data.at(-1)?.close.toFixed(2) ?? "--"}`} />
            <SignalBox
              label="Trend"
              display={`SMA20 fc last: ${signals.sma20?.at(-1)?.value?.toFixed(2) ?? "--"
                } | EMA20: ${signals.ema20?.at(-1)?.value?.toFixed(1) ?? "--"
                } | EMA50: ${signals.ema50?.at(-1)?.value?.toFixed(1) ?? "--"
                } | EMA200: ${signals.ema200?.at(-1)?.value?.toFixed(1) ?? "--"
                }`}
            />
            <SignalBox
              label="Momentum"
              display={`RSI14 last: ${signals.rsi14?.at(-1)?.value?.toFixed(2) ?? "--"
                } | MACD: ${signals.macd?.at(-1)?.value?.toFixed(2) ?? "--"
                } | StochRSI: ${signals.stoch_rsi?.at(-1)?.value?.toFixed(2) ?? "--"
                }`}
            />
            <SignalBox
              label="Volatility"
              display={`ATR14 last: ${signals.atr14?.at(-1)?.value?.toFixed(2) ?? "--"
                } | Bollinger Bands (20,2): ${signals.bollinger20?.at(-1)?.value?.toFixed(2) ?? "--"
                }`}
            />
            <SignalBox
              label="Volume"
              display={`OBV last: ${signals.obv?.at(-1)?.value?.toFixed(0) ?? "--"
                } | Volume SMA20: ${signals.vol_sma20?.at(-1)?.value?.toFixed(0) ?? "--"
                } | VWAP: ${signals.vwap?.at(-1)?.value?.toFixed(2) ?? "--"
                }`}
            />
          </div>
        )}

        {!loading && data.length > 0 && (
  <div className="saveButton">
    <button
      onClick={() => {
        const latestSignals = Object.fromEntries(
          Object.entries(signals).map(([key, value]) => [
            key,
            Array.isArray(value)
              ? value.length > 0
                ? [value[value.length - 1]]
                : []
              : value,
          ])
        );

        const toSave = {
          symbol,
          data: data.length > 0 ? [data[data.length - 1]] : [],
          signals: latestSignals,
        };

        localStorage.setItem(`saved_${symbol}`, JSON.stringify(toSave));
        alert(`Saved latest ${symbol} data to localStorage!`);
      }}
    >
      Save Data
    </button>
  </div>
)}

        <footer className="footer">Gateway: {API}</footer>
      </div>
    </div>
  );
}
