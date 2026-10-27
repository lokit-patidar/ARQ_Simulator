// The sender window and the receiver window, drawn as a row of numbered boxes.

// Colours for each kind of box
const TONES = {
  done: "border-ack bg-ack/15 text-ack",
  sent: "border-frame bg-frame/15 text-frame",
  retry: "border-retry bg-retry/20 text-retry",
  buffer: "border-buffer bg-buffer/15 text-buffer",
  ready: "border-ink/40 bg-white text-ink",
  idle: "border-line bg-transparent text-ink/30",
};

function Cell({ number, seq, tone, inWindow }) {
  return (
    <div className="flex w-9 shrink-0 flex-col items-center">
      <div className={"flex h-9 w-9 items-center justify-center rounded-md border-2 font-mono text-sm font-semibold transition-colors duration-300 " + TONES[tone]}>
        {number}
      </div>
      <div className="mt-0.5 font-mono text-[10px] text-ink/45">s{seq}</div>
      {/* the bar under the boxes shows which boxes are inside the window */}
      <div className={"mt-0.5 h-1.5 w-full " + (inWindow ? "bg-ink" : "bg-transparent")} />
    </div>
  );
}

function Legend({ tone, text }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-ink/70">
      <span className={"inline-block h-3.5 w-3.5 rounded border-2 " + TONES[tone]} />
      {text}
    </span>
  );
}

export default function Windows({ snapshot, config, time, sequenceSpace }) {
  const total = config.totalFrames;
  const count = Math.min(total, 18); // how many boxes we draw
  const start = Math.max(0, Math.min(snapshot.senderBase - 2, total - count));

  const senderCells = [];
  const receiverCells = [];

  for (let f = start; f < start + count; f++) {
    const seq = f % sequenceSpace;

    // ----- sender box -----
    const inSenderWindow = f >= snapshot.senderBase && f < snapshot.senderBase + config.senderWindow;
    let senderTone = "idle";
    if (snapshot.acked[f]) senderTone = "done";
    else if (snapshot.attempts[f] > 1) senderTone = "retry";
    else if (snapshot.attempts[f] === 1) senderTone = "sent";
    else if (inSenderWindow) senderTone = "ready";
    senderCells.push(<Cell key={f} number={f} seq={seq} tone={senderTone} inWindow={inSenderWindow} />);

    // ----- receiver box -----
    const inReceiverWindow = f >= snapshot.receiverBase && f < snapshot.receiverBase + config.receiverWindow;
    let receiverTone = "idle";
    if (f < snapshot.receiverBase) receiverTone = "done";
    else if (snapshot.received[f]) receiverTone = "buffer";
    else if (inReceiverWindow) receiverTone = "ready";
    receiverCells.push(<Cell key={f} number={f} seq={seq} tone={receiverTone} inWindow={inReceiverWindow} />);
  }

  return (
    <div className="rounded-xl border border-line bg-white/90 p-4 shadow-sm backdrop-blur">
      <div className="space-y-4 overflow-x-auto pb-1">
        <div>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Sender window</h3>
            <span className="font-mono text-xs text-ink/60">
              size {config.senderWindow}, starts at frame {snapshot.senderBase}
            </span>
          </div>
          <div className="flex gap-1">{senderCells}</div>

          {/* running timers */}
          <div className="mt-2 flex min-h-6 flex-wrap gap-1.5">
            {snapshot.timers.length === 0 && <span className="text-xs text-ink/40">No timer running</span>}
            {snapshot.timers.map((t) => (
              <span key={t.frame} className="rounded-full border border-retry bg-retry/10 px-2 py-0.5 font-mono text-xs text-retry">
                timer F{t.frame}: {Math.max(0, t.expiresAt - time).toFixed(1)} left
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Receiver window</h3>
            <span className="font-mono text-xs text-ink/60">
              size {config.receiverWindow}, expects frame {snapshot.receiverBase}
            </span>
          </div>
          <div className="flex gap-1">{receiverCells}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3">
        <Legend tone="ready" text="Allowed to send" />
        <Legend tone="sent" text="Sent, waiting" />
        <Legend tone="retry" text="Sent again" />
        <Legend tone="done" text="Acknowledged / delivered" />
        <Legend tone="buffer" text="Buffered at receiver" />
        <span className="flex items-center gap-1.5 text-xs text-ink/70">
          <span className="inline-block h-1.5 w-5 bg-ink" /> Inside the window
        </span>
      </div>
      {total > count && (
        <p className="mt-2 text-xs text-ink/50">
          Showing {count} of {total} frames. The view slides along as the window moves. "s" is the sequence number.
        </p>
      )}
    </div>
  );
}
