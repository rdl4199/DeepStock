import React, { useMemo, useState } from "react";

type PricePoint = { date: string; close: number };

type AnyObj = Record<string, any>;

export type SavedStockDoc = {
  _id?: string;
  symbol: string;
  createdAt?: string;
  updatedAt?: string;
  data?: PricePoint[];
  signals?: AnyObj; // signals has mixed shapes (arrays + sometimes a string "symbol")
};

function lastPoint<T = any>(v: any): T | undefined {
  return Array.isArray(v) && v.length > 0 ? v[v.length - 1] : undefined;
}

function fmt(n: any, digits = 2): string {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return "--";
  return num.toFixed(digits);
}

export default function SavedStockCard({ doc }: { doc: SavedStockDoc }): JSX.Element {
  const [open, setOpen] = useState(false);

  const lastPrice = useMemo(() => {
    const p = doc.data?.length ? doc.data[doc.data.length - 1] : undefined;
    return p;
  }, [doc.data]);

  const s = doc.signals ?? {};

  // Key signals (grab latest element of each array)
  const rsi = lastPoint<{ value?: number }>(s.rsi14)?.value;
  const ema20 = lastPoint<{ value?: number }>(s.ema20)?.value;
  const ema50 = lastPoint<{ value?: number }>(s.ema50)?.value;
  const ema200 = lastPoint<{ value?: number }>(s.ema200)?.value;

  const macdPt = lastPoint<{ macd?: number; signal?: number; hist?: number }>(s.macd);
  const atr = lastPoint<{ value?: number }>(s.atr14)?.value;
  const bb = lastPoint<{ mid?: number; upper?: number; lower?: number }>(s.bollinger20);

  const volSma = lastPoint<{ value?: number }>(s.vol_sma20)?.value;
  const vwap = lastPoint<{ value?: number }>(s.vwap)?.value;

  const updated = doc.updatedAt ? new Date(doc.updatedAt).toLocaleString() : "--";

  return (
    <div className="savedCard">
      <div className="savedTopRow">
        <div>
          <div className="savedSymbol">{doc.symbol}</div>
          <div className="savedMeta">Updated: {updated}</div>
        </div>

        <button className="savedBtn" onClick={() => setOpen((v) => !v)}>
          {open ? "Show less" : "Show more"}
        </button>
      </div>

      <div className="savedMetrics">
        <div className="savedMetric">
          <div className="savedMetricLabel">Last close</div>
          <div className="savedMetricValue">
            {lastPrice ? `${fmt(lastPrice.close, 2)} (${lastPrice.date})` : "--"}
          </div>
        </div>

        <div className="savedMetric">
          <div className="savedMetricLabel">RSI14</div>
          <div className="savedMetricValue">{fmt(rsi, 2)}</div>
        </div>

        <div className="savedMetric">
          <div className="savedMetricLabel">Trend (EMA)</div>
          <div className="savedMetricValue">
            20: {fmt(ema20, 1)} | 50: {fmt(ema50, 1)} | 200: {fmt(ema200, 1)}
          </div>
        </div>

        <div className="savedMetric">
          <div className="savedMetricLabel">MACD</div>
          <div className="savedMetricValue">
            m: {fmt(macdPt?.macd, 2)} | s: {fmt(macdPt?.signal, 2)} | h: {fmt(macdPt?.hist, 2)}
          </div>
        </div>

        <div className="savedMetric">
          <div className="savedMetricLabel">Volatility</div>
          <div className="savedMetricValue">
            ATR14: {fmt(atr, 2)} | BB: {fmt(bb?.lower, 2)} / {fmt(bb?.mid, 2)} / {fmt(bb?.upper, 2)}
          </div>
        </div>

        <div className="savedMetric">
          <div className="savedMetricLabel">Volume</div>
          <div className="savedMetricValue">
            Vol SMA20: {fmt(volSma, 0)} | VWAP: {fmt(vwap, 2)}
          </div>
        </div>
      </div>

      {open && (
        <div className="savedMore">
          <div className="savedMoreLabel">Full record</div>
          <pre className="savedPre">{JSON.stringify(doc, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}