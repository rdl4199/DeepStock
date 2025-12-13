from fastapi import FastAPI, Query
from pydantic import BaseModel
import httpx, pandas as pd
import numpy as np

app = FastAPI()

class IndicatorResponse(BaseModel):
    symbol: str
    sma20: list[dict] | None = None
    ema20: list[dict] | None = None
    ema50: list[dict] | None = None
    ema200: list[dict] | None = None
    rsi14: list[dict] | None = None
    macd: list[dict] | None = None          # {t, macd, signal, hist}
    stoch_rsi: list[dict] | None = None     # {t, value}
    atr14: list[dict] | None = None         # {t, value}
    bollinger20: list[dict] | None = None   # {t, upper, mid, lower}
    vol_sma20: list[dict] | None = None     # {t, value}
    obv: list[dict] | None = None           # {t, value}
    vwap: list[dict] | None = None          # {t, value}

PRICE_SVC = "http://svc-pricing-go:8080"


@app.get("/signals", response_model=IndicatorResponse)
async def signals(symbol: str = Query(..., min_length=1)):
    # Pull bars from Go service
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(f"{PRICE_SVC}/series", params={"symbol": symbol})
        r.raise_for_status()
        bars = r.json()

    df = pd.DataFrame(bars)
    # Expecting columns: t, o, h, l, c, v
    df["t"] = pd.to_datetime(df["t"])
    df = df.set_index("t").sort_index()

    out: dict = {"symbol": symbol}

    # --- Trend: SMA / EMA ---

    # SMA(20)
    sma20 = df["c"].rolling(20).mean().dropna()
    out["sma20"] = [
        {"t": i.strftime("%Y-%m-%d"), "value": float(v)}
        for i, v in sma20.items()
    ]

    # EMA(20, 50, 200)
    ema20 = df["c"].ewm(span=20, adjust=False).mean().dropna()
    ema50 = df["c"].ewm(span=50, adjust=False).mean().dropna()
    ema200 = df["c"].ewm(span=200, adjust=False).mean().dropna()

    out["ema20"] = [
        {"t": i.strftime("%Y-%m-%d"), "value": float(v)}
        for i, v in ema20.items()
    ]
    out["ema50"] = [
        {"t": i.strftime("%Y-%m-%d"), "value": float(v)}
        for i, v in ema50.items()
    ]
    out["ema200"] = [
        {"t": i.strftime("%Y-%m-%d"), "value": float(v)}
        for i, v in ema200.items()
    ]

    # --- Momentum: RSI, MACD, StochRSI ---

    # RSI(14)
    delta = df["c"].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(14).mean()
    avg_loss = loss.rolling(14).mean()
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    rsi14 = rsi.dropna()

    out["rsi14"] = [
        {"t": i.strftime("%Y-%m-%d"), "value": float(v)}
        for i, v in rsi14.items()
    ]

    # MACD (12, 26, 9)
    ema12 = df["c"].ewm(span=12, adjust=False).mean()
    ema26 = df["c"].ewm(span=26, adjust=False).mean()
    macd_line = ema12 - ema26
    signal_line = macd_line.ewm(span=9, adjust=False).mean()
    macd_hist = macd_line - signal_line
    macd_df = pd.DataFrame(
        {"macd": macd_line, "signal": signal_line, "hist": macd_hist}
    ).dropna()

    out["macd"] = [
        {
            "t": i.strftime("%Y-%m-%d"),
            "macd": float(row["macd"]),
            "signal": float(row["signal"]),
            "hist": float(row["hist"]),
        }
        for i, row in macd_df.iterrows()
    ]

    # StochRSI (14)
    rsi_min = rsi.rolling(14).min()
    rsi_max = rsi.rolling(14).max()
    stoch_rsi = (rsi - rsi_min) / (rsi_max - rsi_min)
    stoch_rsi = stoch_rsi.dropna()

    out["stoch_rsi"] = [
        {"t": i.strftime("%Y-%m-%d"), "value": float(v)}
        for i, v in stoch_rsi.items()
    ]

    # --- Volatility: ATR(14), Bollinger Bands(20, 2) ---

    # ATR(14)
    high = df["h"]
    low = df["l"]
    close = df["c"]

    prev_close = close.shift(1)
    tr1 = (high - low).abs()
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    atr14 = tr.rolling(14).mean().dropna()

    out["atr14"] = [
        {"t": i.strftime("%Y-%m-%d"), "value": float(v)}
        for i, v in atr14.items()
    ]

    # Bollinger Bands (20, 2)
    bb_mid = df["c"].rolling(20).mean()
    bb_std = df["c"].rolling(20).std()
    bb_upper = bb_mid + 2 * bb_std
    bb_lower = bb_mid - 2 * bb_std
    bb = pd.DataFrame(
        {"mid": bb_mid, "upper": bb_upper, "lower": bb_lower}
    ).dropna()

    out["bollinger20"] = [
        {
            "t": i.strftime("%Y-%m-%d"),
            "mid": float(row["mid"]),
            "upper": float(row["upper"]),
            "lower": float(row["lower"]),
        }
        for i, row in bb.iterrows()
    ]

    # --- Volume / Flow: Volume SMA, OBV, VWAP ---

    # Volume SMA(20)
    vol_sma20 = df["v"].rolling(20).mean().dropna()
    out["vol_sma20"] = [
        {"t": i.strftime("%Y-%m-%d"), "value": float(v)}
        for i, v in vol_sma20.items()
    ]

    # OBV
    obv = []
    current_obv = 0
    prev_close = None
    for ts, row in df.iterrows():
        c_price = row["c"]
        vol = row["v"]
        if prev_close is None:
            current_obv = 0
        else:
            if c_price > prev_close:
                current_obv += vol
            elif c_price < prev_close:
                current_obv -= vol
            # equal -> no change
        obv.append((ts, current_obv))
        prev_close = c_price

    out["obv"] = [
        {"t": ts.strftime("%Y-%m-%d"), "value": float(v)}
        for ts, v in obv
    ]

    # VWAP (cumulative)
    # If you're getting intraday bars, this is "true" VWAP.
    # If daily, it still behaves like a price-flow anchor.
    typical_price = (df["h"] + df["l"] + df["c"]) / 3.0
    cum_tp_vol = (typical_price * df["v"]).cumsum()
    cum_vol = df["v"].cumsum()
    vwap = (cum_tp_vol / cum_vol).dropna()

    out["vwap"] = [
        {"t": i.strftime("%Y-%m-%d"), "value": float(v)}
        for i, v in vwap.items()
    ]

    return out
