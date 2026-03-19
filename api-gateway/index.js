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

app.get("/api/series-mongo", async (req, res) => {
  try {
    const r = await fetch(`${PRICE_SVC_URL}/getSavedStocks`);
    const body = await r.text();

    if (!r.ok) throw new Error(`status ${r.status}`);

    return res
      .status(r.status)
      .type(r.headers.get("content-type") || "application/json")
      .send(body);
  } catch (e) {
    return res.status(502).json({
      error: "pricing service unavailable",
      detail: String(e),
    });
  }
});

app.delete("/api/series-mongo/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "missing id" });

  try {
    const r = await fetch(
      `${PRICE_SVC_URL}/deleteSavedStocks?id=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );

    const body = await r.text();
    res
      .status(r.status)
      .type(r.headers.get("content-type") || "application/json")
      .send(body);
  } catch (e) {
    res.status(502).json({ error: "pricing service unavailable", detail: String(e) });
  }
});


// Proxy indicators: /api/signals?symbol=AAPL
app.post("/api/signals", async (req, res) => {
  const { symbol, bars } = req.body;

  if (!symbol) {
    return res.status(400).json({ error: "missing symbol" });
  }

  if (!Array.isArray(bars) || bars.length === 0) {
    return res.status(400).json({ error: "missing bars" });
  }

  try {
    const r = await fetch(`${ML_SVC_URL}/signals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ symbol, bars }),
    });

    const body = await r.text();

    res
      .status(r.status)
      .type(r.headers.get("content-type") || "application/json")
      .send(body);
  } catch (e) {
    res.status(502).json({ error: "ml service unavailable", detail: String(e) });
  }
});

// Save a stock snapshot: frontend -> node -> go
app.post("/api/saved-stocks", async (req, res) => {
  if (!PRICE_SVC_URL) {
    return res.status(500).json({ error: "PRICE_SVC_URL is not set" });
  }

  try {
    // Change the path/method below to match your Go route exactly.
    // If your Go route is mux.HandleFunc("/postSavedStocks", ...) expecting PUT:
    const r = await fetch(`${PRICE_SVC_URL}/postSavedStocks`, {
      method: "POST", // or "PUT" if you make your Go handler PUT
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const body = await r.text();
    return res
      .status(r.status)
      .type(r.headers.get("content-type") || "application/json")
      .send(body);
  } catch (e) {
    return res.status(502).json({
      error: "go pricing service unavailable",
      detail: String(e),
    });
  }
});

app.listen(PORT, () => console.log(`api-gateway on :${PORT}`));
