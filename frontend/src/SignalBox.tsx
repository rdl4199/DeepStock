import React from "react";
import "../styles/SignalBox.css";
export default function SignalBox({ label, display }: { label: string; display: string}) {

  return (
    <div className="signalInfoBox">
      <div className="signalLabel">{label}</div>
      <div className="signalDisplay">{display}</div>
    </div>
  );
}
