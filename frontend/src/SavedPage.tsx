import { useState } from "react";
import SavedStockCard, { SavedStockDoc } from "./SavedStockCard";

const API = import.meta.env.VITE_API_BASE as string;

export function SavedPage(): JSX.Element {
  const [mongoData, setMongoData] = useState<SavedStockDoc[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadMongoData(): Promise<void> {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`${API}/api/series-mongo`);
      if (!r.ok) throw new Error(await r.text());

      const data = await r.json();
      // handle either array or single object
      const arr = Array.isArray(data) ? data : [data];
      setMongoData(arr);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setMongoData([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-container">
      <h1 className="app-title">Saved Data</h1>

      <div className="symbol-controls">
        <button className="load-button" onClick={loadMongoData}>
          {loading ? "Loading…" : "Load from Mongo"}
        </button>
      </div>

      {err && <div className="error-text">Error: {err}</div>}

      <div className="savedGrid">
        {mongoData.map((doc) => (
          <SavedStockCard key={doc._id ?? doc.symbol} doc={doc} />
        ))}
      </div>
    </div>
  );
}