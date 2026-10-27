// The animated channel: the sender is on the left, the receiver on the right.
// Frames travel along the top lane, ACKs travel back along the bottom lane.
import { FRAME_TIME, PROP_DELAY, TIMEOUT_TIME } from "../simulator.js";

// How far along the lane is this packet? 0 = start, 1 = end.
function progressOf(packet, time) {
  const p = (time - packet.sentAt) / (packet.arriveAt - packet.sentAt);
  const clamped = Math.max(0, Math.min(1, p));
  // A lost packet only travels half way, then it dies
  return packet.lost ? Math.min(clamped, 0.5) : clamped;
}

// Colour classes (written in full so Tailwind can find them)
function packetClasses(packet) {
  if (packet.kind === "ack") return "border-ack bg-ack text-white";
  if (packet.retransmission) return "border-retry bg-retry text-white";
  return "border-frame bg-frame text-white";
}

function Packet({ packet, time }) {
  const progress = progressOf(packet, time);
  // Frames go left to right, ACKs go right to left
  const x = packet.kind === "frame" ? progress : 1 - progress;
  const top = packet.kind === "frame" ? "28%" : "72%";

  const duration = packet.arriveAt - packet.sentAt;
  const deathTime = packet.sentAt + duration * 0.5;
  const dead = packet.lost && time >= deathTime;

  if (dead) {
    // fade away for a short time after the loss
    if (time > deathTime + 1.5) return null;
    return (
      <div
        className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-loss bg-white text-sm font-bold text-loss"
        style={{ left: x * 100 + "%", top: top }}
        title={"Lost: " + (packet.kind === "ack" ? "ACK " : "Frame ") + packet.frame}
      >
        ✕
      </div>
    );
  }

  if (time >= packet.arriveAt) return null;

  return (
    <div
      className={
        "absolute flex h-8 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border font-mono text-xs font-semibold shadow " +
        packetClasses(packet)
      }
      style={{ left: x * 100 + "%", top: top }}
    >
      {packet.kind === "frame" ? "F" : "A"}
      {packet.frame}
    </div>
  );
}

function Station({ title, line1, line2, tone }) {
  return (
    <div className={"flex w-16 shrink-0 flex-col justify-center rounded-lg border-2 bg-white p-1.5 text-center sm:w-32 sm:p-3 " + tone}>
      <div className="text-xs font-semibold sm:text-sm">{title}</div>
      <div className="mt-1 hidden font-mono text-[11px] leading-snug text-ink/65 sm:block">{line1}</div>
      <div className="hidden font-mono text-[11px] leading-snug text-ink/65 sm:block">{line2}</div>
    </div>
  );
}

export default function Channel({ packets, time, snapshot, latest }) {
  // Only draw packets that have already been sent and are still visible
  const visible = packets.filter((p) => p.sentAt <= time);

  return (
    <div className="rounded-xl border border-line bg-white/90 p-4 shadow-sm backdrop-blur">
      <div className="flex items-stretch gap-3">
        <Station
          title="Sender"
          tone="border-frame"
          line1={"base = " + snapshot.senderBase}
          line2={"next = " + snapshot.nextToSend}
        />

        {/* the channel */}
        <div className="relative h-44 flex-1 overflow-hidden rounded-lg bg-paper/70">
          {/* lane lines */}
          <div className="absolute inset-x-0 top-[28%] border-t-2 border-dashed border-frame/30" />
          <div className="absolute inset-x-0 top-[72%] border-t-2 border-dashed border-ack/30" />
          <div className="absolute left-3 top-[28%] -translate-y-6 text-[11px] font-medium text-frame/70">frames ▶</div>
          <div className="absolute right-3 top-[72%] translate-y-3 text-[11px] font-medium text-ack/80">◀ ACKs</div>

          {visible.map((p, i) => (
            <Packet key={i} packet={p} time={time} />
          ))}
        </div>

        <Station
          title="Receiver"
          tone="border-ack"
          line1={"expects = " + snapshot.receiverBase}
          line2={"delivered = " + snapshot.delivered}
        />
      </div>

      {/* what is happening right now */}
      <p className="mt-3 min-h-6 rounded-md bg-ink px-3 py-1.5 font-mono text-xs text-white" aria-live="off">
        {latest ? "t = " + latest.time.toFixed(1) + "   " + latest.text : "Press Play to start the simulation."}
      </p>

      <p className="mt-2 text-xs text-ink/55">
        A frame takes {FRAME_TIME + PROP_DELAY} time units to reach the receiver and its ACK takes {PROP_DELAY} more
        to come back. The sender waits {TIMEOUT_TIME} units before it gives up on a frame.
      </p>
    </div>
  );
}
