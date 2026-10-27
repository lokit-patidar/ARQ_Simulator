// Runs all three protocols with the same frames and the same losses,
// then puts the results next to each other.
import { useMemo } from "react";
import { runSimulation, PROTOCOL_NAMES } from "../simulator.js";

export default function Compare({ config }) {
  const rows = useMemo(() => {
    const space = 2 ** config.seqBits;
    // If the chosen protocol is Stop-and-Wait (window 1) we try window 4 for the others
    const wanted = config.protocol === 1 ? 4 : config.senderWindow;

    return [1, 2, 3].map((protocol) => {
      let senderWindow = 1;
      let receiverWindow = 1;
      if (protocol === 2) senderWindow = Math.min(wanted, space - 1);
      if (protocol === 3) {
        senderWindow = Math.min(wanted, space / 2);
        receiverWindow = senderWindow;
      }
      const result = runSimulation({ ...config, protocol, senderWindow, receiverWindow });
      return { protocol, senderWindow, receiverWindow, result };
    });
  }, [config]);

  const bestTime = Math.min(...rows.map((r) => r.result.stats.time));

  const cell = "px-3 py-2 text-right font-mono";

  return (
    <section className="rounded-xl border border-line bg-white/90 p-4 shadow-sm backdrop-blur">
      <h2 className="text-sm font-semibold">Compare the three protocols</h2>
      <p className="mb-3 text-xs text-ink/60">
        Same {config.totalFrames} frames, same lost frames and ACKs, {config.seqBits} sequence bit
        {config.seqBits === 1 ? "" : "s"}. Windows are shown in the table.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink/60">
              <th className="px-3 py-2 text-left font-medium">Protocol</th>
              <th className="px-3 py-2 text-right font-medium">Window (send / receive)</th>
              <th className="px-3 py-2 text-right font-medium">Total time</th>
              <th className="px-3 py-2 text-right font-medium">Attempts</th>
              <th className="px-3 py-2 text-right font-medium">Retransmissions</th>
              <th className="px-3 py-2 text-right font-medium">Discarded</th>
              <th className="px-3 py-2 text-right font-medium">Timeouts</th>
              <th className="px-3 py-2 text-right font-medium">Efficiency</th>
              <th className="px-3 py-2 text-right font-medium">Integrity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = r.result.stats;
              const isBest = s.time === bestTime;
              return (
                <tr key={r.protocol} className={"border-b border-line/60 " + (r.protocol === config.protocol ? "bg-frame/5" : "")}>
                  <td className="whitespace-nowrap px-3 py-2 font-medium">
                    {PROTOCOL_NAMES[r.protocol]}
                    {r.protocol === config.protocol && <span className="ml-2 text-xs font-normal text-frame">(selected)</span>}
                  </td>
                  <td className={cell}>
                    {r.senderWindow} / {r.receiverWindow}
                  </td>
                  <td className={cell + (isBest ? " font-semibold text-ack" : "")}>
                    {s.time.toFixed(1)}
                    {isBest && <span className="ml-1 text-xs">fastest</span>}
                  </td>
                  <td className={cell}>{s.attempts}</td>
                  <td className={cell}>{s.retransmissions}</td>
                  <td className={cell}>{s.discarded}</td>
                  <td className={cell}>{s.timeouts}</td>
                  <td className={cell}>{s.attempts === 0 ? "-" : ((s.delivered / s.attempts) * 100).toFixed(0) + "%"}</td>
                  <td className={cell + (r.result.integrityPassed ? " text-ack" : " text-loss")}>
                    {r.result.integrityPassed ? "PASSED" : "FAILED"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink/50">Efficiency = frames delivered divided by transmission attempts.</p>
    </section>
  );
}
