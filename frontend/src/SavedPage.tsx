import { useState } from "react";

const API = import.meta.env.VITE_API_BASE as string;

export function SavedPage(): JSX.Element {
  const [mongoData, setMongoData] = useState<any[]>([]);
  const [err, setErr] = useState("");

  async function loadMongoData(): Promise<void> {
    fetch(`${API}/api/series-mongo`)
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
      .then((data) => {
        console.log("mongo data", data);
        setMongoData(data);
      })
      .catch((e) => setErr(String(e)));
  }

  return (
    <div>
      <h1>Saved Data</h1>
      <button onClick={loadMongoData}>Load from Mongo</button>
      {err && <p style={{ color: "red" }}>Error: {err}</p>}

      <pre style={{ textAlign: "left", maxHeight: "400px", overflow: "auto" }}>
        {JSON.stringify(mongoData, null, 2)}
      </pre>
    </div>
  );
}
