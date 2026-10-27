// The performance summary cards. They count up while the simulation plays.

function Card({ label, value, tone = "text-ink" }) {
  return (
    <div className="rounded-lg border border-line bg-white/90 px-3 py-2.5 shadow-sm">
      <div className={"font-mono text-2xl font-semibold " + tone}>{value}</div>
      <div className="text-xs text-ink/60">{label}</div>
    </div>
  );
}

export default function Stats({ stats, result, finished }) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Performance summary</h2>

        {finished ? (
          <span
            className={
              "rounded-full px-3 py-1 text-xs font-semibold " +
              (result.integrityPassed ? "bg-ack/15 text-ack" : "bg-loss/15 text-loss")
            }
          >
            Integrity check (all frames in order, exactly once): {result.integrityPassed ? "PASSED" : "FAILED"}
          </span>
        ) : (
          <span className="text-xs text-ink/50">Integrity check appears when the simulation ends</span>
        )}
      </div>

      {result.stalled && (
        <p className="mb-2 rounded-md bg-loss/10 px-3 py-2 text-sm text-loss">
          WARNING: the simulation stalled before all frames were acknowledged.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card label="Frames delivered" value={stats.delivered + " / " + result.config.totalFrames} tone="text-ack" />
        <Card label="Transmission attempts" value={stats.attempts} tone="text-frame" />
        <Card label="Retransmissions" value={stats.retransmissions} tone="text-retry" />
        <Card label="Frames discarded" value={stats.discarded} />
        <Card label="Frames lost in channel" value={stats.framesLost} tone="text-loss" />
        <Card label="ACKs lost (of generated)" value={stats.acksLost + " / " + stats.acksGenerated} tone="text-loss" />
        <Card label="Timeouts" value={stats.timeouts} tone="text-retry" />
        <Card label="Simulated time" value={stats.time.toFixed(1)} />
      </div>
    </section>
  );
}
