import { useEffect, useState } from "react";
import SavedStockCard, { SavedStockDoc } from "./SavedStockCard";
import HamburgerMenu from "./HamburgerMenu.tsx";

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
      const arr = Array.isArray(data) ? data : [data];
      setMongoData(arr);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setMongoData([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMongoData();
  }, []);

  return (
    <div className="app-container">
      <HamburgerMenu
        items={[
          { label: "Homeeeee", href: "/" },
          { label: "Saved", href: "/savedpage" },
        ]}
      />

      <h1 className="app-title">Saved Data</h1>

      {loading && <div className="loading-text">Loading…</div>}
      {err && <div className="error-text">Error: {err}</div>}

      <div className="savedGrid">
        {mongoData.map((doc) => (
          <SavedStockCard key={doc._id ?? doc.symbol} doc={doc} />
        ))}
      </div>
    </div>
  );
}