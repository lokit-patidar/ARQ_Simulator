// Play / pause / step buttons, speed and the time slider.

const SPEEDS = [0.25, 0.5, 1, 2];

function IconButton({ label, onClick, children, strong = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={
        "flex h-10 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors " +
        (strong
          ? "min-w-24 border-ink bg-ink text-white hover:bg-ink/85"
          : "border-line bg-white text-ink hover:border-frame hover:text-frame")
      }
    >
      {children}
    </button>
  );
}

export default function Controls({ time, end, playing, speed, onPlay, onPause, onStep, onBack, onReset, onSeek, onSpeed }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white/90 p-3 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2">
        <IconButton label="Go back one event" onClick={onBack}>
          ◀ Back
        </IconButton>
        {playing ? (
          <IconButton label="Pause" onClick={onPause} strong>
            ❚❚ Pause
          </IconButton>
        ) : (
          <IconButton label="Play" onClick={onPlay} strong>
            ▶ {time >= end ? "Replay" : "Play"}
          </IconButton>
        )}
        <IconButton label="Go forward one event" onClick={onStep}>
          Step ▶
        </IconButton>
        <IconButton label="Back to time 0" onClick={onReset}>
          Reset
        </IconButton>
      </div>

      {/* time slider */}
      <div className="flex min-w-48 flex-1 items-center gap-3">
        <input
          type="range"
          min={0}
          max={end}
          step={0.1}
          value={time}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Simulation time"
          className="h-2 w-full cursor-pointer accent-frame"
        />
        <span className="w-28 shrink-0 text-right font-mono text-sm">
          t = {time.toFixed(1)} <span className="text-ink/45">/ {end.toFixed(0)}</span>
        </span>
      </div>

      {/* speed */}
      <div className="flex items-center gap-1 rounded-lg bg-paper p-1" role="group" aria-label="Speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSpeed(s)}
            className={
              "rounded-md px-2.5 py-1.5 font-mono text-xs transition-colors " +
              (speed === s ? "bg-white font-semibold text-ink shadow" : "text-ink/60 hover:text-ink")
            }
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
