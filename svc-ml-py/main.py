from fastapi import FastAPI, Query
from pydantic import BaseModel
import httpx, pandas as pd

app = FastAPI()

class IndicatorResponse(BaseModel):
    symbol: str
    sma20: list[dict] | None = None
    rsi14: list[dict] | None = None

PRICE_SVC = "http://svc-pricing-go:8080"

@app.get("/signals", response_model=IndicatorResponse)
async def signals(symbol: str = Query(..., min_length=1)):
    # Pull bars from Go service
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(f"{PRICE_SVC}/series", params={"symbol": symbol})
        r.raise_for_status()
        bars = r.json()

    df = pd.DataFrame(bars)
    df["t"] = pd.to_datetime(df["t"])
    df = df.set_index("t").sort_index()
    out = {"symbol": symbol}

    # SMA(20)
    sma = df["c"].rolling(20).mean().dropna()
    out["sma20"] = [{"t": i.strftime("%Y-%m-%d"), "value": float(v)} for i, v in sma.items()]

    # RSI(14)
    delta = df["c"].diff()
    up = delta.clip(lower=0).rolling(14).mean()
    down = (-delta.clip(upper=0)).rolling(14).mean()
    rs = up / down
    rsi = 100 - (100 / (1 + rs))
    rsi = rsi.dropna()
    out["rsi14"] = [{"t": i.strftime("%Y-%m-%d"), "value": float(v)} for i, v in rsi.items()]

    return out
