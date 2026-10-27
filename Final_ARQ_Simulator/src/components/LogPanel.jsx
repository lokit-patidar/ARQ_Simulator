// The transmission log (the same lines the C++ program prints).
import { useEffect, useRef, useState } from "react";
import { formatLogLine, makeTextOutput } from "../simulator.js";

// A coloured bar at the left of each line
const KIND_CLASSES = {
  send: "border-frame text-ink",
  retransmit: "border-retry text-retry",
  receive: "border-ack text-ink",
  buffer: "border-buffer text-buffer",
  ack: "border-ack text-ack",
  ackrecv: "border-ack text-ink",
  loss: "border-loss bg-loss/10 text-loss font-medium",
  discard: "border-ink/30 text-ink/55",
  timeout: "border-retry bg-retry/10 text-retry font-medium",
  window: "border-buffer text-buffer",
  info: "border-transparent text-ink/55",
};

export default function LogPanel({ logs, shown, result }) {
  const boxRef = useRef(null);
  const [message, setMessage] = useState("");

  // always scroll to the newest line
  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [shown]);

  function say(text) {
    setMessage(text);
    setTimeout(() => setMessage(""), 1800);
  }

  async function copyLog() {
    try {
      await navigator.clipboard.writeText(makeTextOutput(result));
      say("Copied");
    } catch (error) {
      say("Copy not allowed here");
    }
  }

  function downloadLog() {
    const blob = new Blob([makeTextOutput(result)], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "arq-simulation-log.txt";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const buttonClass =
    "rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium transition-colors hover:border-frame hover:text-frame";

  return (
    <div className="flex flex-col rounded-xl border border-line bg-white/90 p-4 shadow-sm backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Transmission log</h3>
        <div className="flex items-center gap-2">
          {message && <span className="text-xs text-ack">{message}</span>}
          <button type="button" onClick={copyLog} className={buttonClass}>
            Copy log
          </button>
          <button type="button" onClick={downloadLog} className={buttonClass}>
            Download .txt
          </button>
        </div>
      </div>

      <div ref={boxRef} className="h-72 overflow-y-auto rounded-lg border border-line bg-paper/60 p-2 font-mono text-[12.5px] leading-relaxed">
        {shown === 0 && <p className="p-2 text-ink/45">The log fills up as the simulation plays.</p>}
        {logs.slice(0, shown).map((entry, i) => (
          <div key={i} className={"whitespace-pre-wrap border-l-4 py-0.5 pl-2 " + (KIND_CLASSES[entry.kind] || KIND_CLASSES.info)}>
            {formatLogLine(entry)}
          </div>
        ))}
      </div>
    </div>
  );
}
