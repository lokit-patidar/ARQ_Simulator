// The classic textbook "time-space diagram".
// Time goes DOWN. The sender is the left line, the receiver is the right line.
// Every slanted arrow is one frame (blue / amber) or one ACK (green).
import { useEffect, useRef } from "react";

const WIDTH = 720;
const LEFT_X = 110; // x position of the sender line
const RIGHT_X = 610; // x position of the receiver line
const PX_PER_UNIT = 20; // how many pixels one time unit takes
const TOP = 24;

function yOf(t) {
  return TOP + t * PX_PER_UNIT;
}

export default function TimeSpace({ packets, logs, time, finalTime }) {
  const boxRef = useRef(null);
  const height = yOf(finalTime) + 40;

  // Keep the current time in view while the animation plays
  // Keep the current time centered, including near the start and end.
  useEffect(() => {
    const box = boxRef.current;
    const svg = box?.querySelector("svg");
    if (!box || !svg) return;

    // Measure the rendered SVG so scrolling follows its actual on-screen position.
    const boxRect = box.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const scaleY = svgRect.height / height;
    const lineY =
      svgRect.top -
      boxRect.top -
      box.clientTop +
      yOf(time) * scaleY;

    // Keep the line still until it passes the midpoint, then follow it.
    const maxScroll = box.scrollHeight - box.clientHeight;
    box.scrollTop = Math.max(
      0,
      Math.min(box.scrollTop + lineY - box.clientHeight / 2, maxScroll)
    );
  }, [time, finalTime, height]);

  // time marks on the left: every 5 units
  const ticks = [];
  for (let t = 0; t <= finalTime; t += 5) ticks.push(t);

  const arrows = [];
  packets.forEach((p, i) => {
    if (p.sentAt > time) return;

    const duration = p.arriveAt - p.sentAt;
    let progress = Math.min(1, (time - p.sentAt) / duration);
    if (p.lost) progress = Math.min(progress, 0.5);

    const fromX = p.kind === "frame" ? LEFT_X : RIGHT_X;
    const toX = p.kind === "frame" ? RIGHT_X : LEFT_X;
    const x1 = fromX;
    const y1 = yOf(p.sentAt);
    const x2 = fromX + (toX - fromX) * progress;
    const y2 = yOf(p.sentAt + duration * progress);

    let color = "var(--color-frame)";
    if (p.kind === "ack") color = "var(--color-ack)";
    else if (p.retransmission) color = "var(--color-retry)";

    const isDead = p.lost && progress >= 0.5;
    const label = (p.kind === "frame" ? "F" : "A") + p.frame;

    arrows.push(
      <g key={i}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2" strokeLinecap="round" />
        {!isDead && <circle cx={x2} cy={y2} r="3.5" fill={color} />}
        {isDead && (
          <g stroke="var(--color-loss)" strokeWidth="2.5" strokeLinecap="round">
            <line x1={x2 - 6} y1={y2 - 6} x2={x2 + 6} y2={y2 + 6} />
            <line x1={x2 + 6} y1={y2 - 6} x2={x2 - 6} y2={y2 + 6} />
          </g>
        )}
        {progress > 0.25 && (
          <text
            x={(x1 + x2) / 2}
            y={(y1 + y2) / 2 - 5}
            fill={color}
            fontSize="11"
            fontWeight="600"
            textAnchor="middle"
            className="font-mono"
          >
            {label}
          </text>
        )}
      </g>
    );
  });

  // timeouts: a small amber diamond on the sender line
  const timeouts = logs.filter((l) => l.kind === "timeout" && l.text.startsWith("Timeout occurred") && l.time <= time);

  return (
    <div className="rounded-xl border border-line bg-white/90 p-4 shadow-sm backdrop-blur">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Time-space diagram</h3>
        <span className="text-xs text-ink/55">time runs downwards</span>
      </div>

      {/* names of the two lines */}
      <div className="relative h-6 text-xs font-semibold">
        <span className="absolute -translate-x-1/2 text-frame" style={{ left: (LEFT_X / WIDTH) * 100 + "%" }}>
          Sender
        </span>
        <span className="absolute -translate-x-1/2 text-ack" style={{ left: (RIGHT_X / WIDTH) * 100 + "%" }}>
          Receiver
        </span>
      </div>

      <div ref={boxRef} className="h-[28rem] overflow-y-auto rounded-lg border border-line bg-paper/60">
        <svg viewBox={"0 0 " + WIDTH + " " + height} width="100%" role="img" aria-label="Time-space diagram of the transmission">
          {/* sender and receiver lines */}
          <line x1={LEFT_X} y1={TOP - 10} x2={LEFT_X} y2={height - 10} stroke="var(--color-ink)" strokeWidth="2" />
          <line x1={RIGHT_X} y1={TOP - 10} x2={RIGHT_X} y2={height - 10} stroke="var(--color-ink)" strokeWidth="2" />

          {/* time marks */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={LEFT_X - 8} y1={yOf(t)} x2={LEFT_X} y2={yOf(t)} stroke="var(--color-ink)" />
              <text x={LEFT_X - 14} y={yOf(t) + 4} fontSize="11" textAnchor="end" fill="var(--color-ink)" opacity="0.55" className="font-mono">
                t={t}
              </text>
            </g>
          ))}

          {arrows}

          {timeouts.map((l, i) => (
            <g key={i}>
              <rect x={LEFT_X - 5} y={yOf(l.time) - 5} width="10" height="10" fill="var(--color-retry)" transform={"rotate(45 " + LEFT_X + " " + yOf(l.time) + ")"} />
              <text x={LEFT_X + 12} y={yOf(l.time) + 4} fontSize="11" fill="var(--color-retry)" fontWeight="600" className="font-mono">
                timeout F{l.frame}
              </text>
            </g>
          ))}

          {/* the "now" line */}
          <line x1="0" y1={yOf(time)} x2={WIDTH} y2={yOf(time)} stroke="var(--color-loss)" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.7" />
        </svg>
      </div>
    </div>
  );
}
