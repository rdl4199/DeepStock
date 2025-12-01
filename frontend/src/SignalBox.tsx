import React from "react";

export default function SignalBox({ label, value }: { label: string; value?: number | null }) {
  const display = value == null || Number.isNaN(value) ? "--" : value.toFixed(2);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 w-40 text-slate-200">
      <div className="text-xs text-slate-400 mb-1 uppercase tracking-wide">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{display}</div>
    </div>
  );
}
