import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors()); // frontend hits localhost:3001
app.use(express.json());

const PORT = process.env.PORT || 3001;
const PRICE_SVC_URL = process.env.PRICE_SVC_URL; // http://svc-pricing-go:8080
const ML_SVC_URL = process.env.ML_SVC_URL;       // http://svc-ml-py:8000

app.get("/healthz", (_, res) => res.sendStatus(204));

// Proxy price series: /api/series?symbol=AAPL
app.get("/api/series", async (req, res) => {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: "missing symbol" });
  try {
    const r = await fetch(`${PRICE_SVC_URL}/series?symbol=${encodeURIComponent(symbol)}`);
    const body = await r.text();
    res.status(r.status).type(r.headers.get("content-type") || "application/json").send(body);
  } catch (e) {
    res.status(502).json({ error: "pricing service unavailable", detail: String(e) });
  }
});

// Proxy indicators: /api/signals?symbol=AAPL
app.get("/api/signals", async (req, res) => {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: "missing symbol" });
  try {
    const r = await fetch(`${ML_SVC_URL}/signals?symbol=${encodeURIComponent(symbol)}`);
    const body = await r.text();
    res.status(r.status).type(r.headers.get("content-type") || "application/json").send(body);
  } catch (e) {
    res.status(502).json({ error: "ml service unavailable", detail: String(e) });
  }
});

app.listen(PORT, () => console.log(`api-gateway on :${PORT}`));
