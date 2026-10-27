// The left panel: choose the protocol, the numbers and which packets get lost.
import { PRESETS, MAX_FRAMES, parseList, toggleInList } from "../formHelpers.js";

const PROTOCOL_BUTTONS = [
  { value: 1, name: "Stop-and-Wait", short: "Window 1" },
  { value: 2, name: "Go-Back-N", short: "Resend all" },
  { value: 3, name: "Selective Repeat", short: "Resend one" },
];

// One labelled text box
function Field({ label, hint, error, value, onChange }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-sm font-medium">
        {label}
        {hint && <span className="font-mono text-xs font-normal text-ink/55">{hint}</span>}
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={
          "mt-1 w-full rounded-md border bg-white px-3 py-2 font-mono text-sm outline-none focus:ring-2 " +
          (error ? "border-loss focus:ring-loss/30" : "border-line focus:ring-frame/30 focus:border-frame")
        }
      />
      {error && <span className="mt-1 block text-xs text-loss">{error}</span>}
    </label>
  );
}

// A text box for a list of frame numbers, plus small buttons you can click
function LossField({ label, value, error, total, onChange }) {
  const parsed = parseList(value, total || 1);
  const selected = parsed.error ? [] : parsed.list;
  const showChips = total >= 1 && total <= 30;

  return (
    <div>
      <label className="block">
        <span className="text-sm font-medium">{label}</span>
        <input
          type="text"
          value={value}
          placeholder="none"
          onChange={(e) => onChange(e.target.value)}
          className={
            "mt-1 w-full rounded-md border bg-white px-3 py-2 font-mono text-sm outline-none focus:ring-2 " +
            (error ? "border-loss focus:ring-loss/30" : "border-line focus:ring-frame/30 focus:border-frame")
          }
        />
      </label>
      {error && <span className="mt-1 block text-xs text-loss">{error}</span>}
      {showChips && (
        <div className="mt-2 flex flex-wrap gap-1">
          {Array.from({ length: total }, (_, n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(toggleInList(value, n))}
              className={
                "h-7 min-w-7 rounded border px-1 font-mono text-xs transition-colors " +
                (selected.includes(n)
                  ? "border-loss bg-loss text-white"
                  : "border-line bg-white text-ink/70 hover:border-loss hover:text-loss")
              }
              title={"Click to lose or keep number " + n}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ConfigPanel({ form, setForm, errors, total, onRun, onPreset }) {
  function change(name, value) {
    setForm({ ...form, [name]: value });
  }

  const protocol = Number(form.protocol);
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="space-y-5 rounded-xl border border-line bg-white/90 p-5 shadow-sm backdrop-blur">
      {/* Examples */}
      <section>
        <h2 className="text-sm font-semibold">Start with an example</h2>
        <div className="mt-2 grid gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => onPreset(p.form)}
              className="rounded-md border border-line bg-paper/60 px-3 py-2 text-left transition-colors hover:border-frame hover:bg-frame/5"
            >
              <span className="block text-sm font-medium">{p.name}</span>
              <span className="block text-xs text-ink/60">{p.note}</span>
            </button>
          ))}
        </div>
      </section>

      <hr className="border-line" />

      {/* Protocol */}
      <section>
        <h2 className="text-sm font-semibold">Protocol</h2>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-paper p-1">
          {PROTOCOL_BUTTONS.map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => change("protocol", b.value)}
              className={
                "rounded-md px-1 py-2 text-center text-xs font-medium leading-tight transition-colors " +
                (protocol === b.value ? "bg-ink text-white shadow" : "text-ink/70 hover:bg-white")
              }
            >
              {b.name}
              <span className={"mt-0.5 block text-[10px] font-normal " + (protocol === b.value ? "text-white/70" : "text-ink/45")}>
                {b.short}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Numbers */}
      <section className="space-y-3">
        <Field
          label="Total frames"
          hint={"1 to " + MAX_FRAMES}
          value={form.totalFrames}
          error={errors.totalFrames}
          onChange={(v) => change("totalFrames", v)}
        />
        <Field
          label="Sequence number bits"
          hint="1 to 16"
          value={form.seqBits}
          error={errors.seqBits}
          onChange={(v) => change("seqBits", v)}
        />
        {protocol !== 1 && (
          <Field
            label="Sender window size"
            value={form.senderWindow}
            error={errors.senderWindow}
            onChange={(v) => change("senderWindow", v)}
          />
        )}
        {protocol === 3 && (
          <Field
            label="Receiver window size"
            value={form.receiverWindow}
            error={errors.receiverWindow}
            onChange={(v) => change("receiverWindow", v)}
          />
        )}
      </section>

      <hr className="border-line" />

      {/* Errors in the channel */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Channel errors</h2>
          <p className="text-xs text-ink/60">Each chosen frame or ACK is lost on its first try only.</p>
        </div>
        <LossField
          label="Frames to be lost"
          value={form.lostFrames}
          error={errors.lostFrames}
          total={total}
          onChange={(v) => change("lostFrames", v)}
        />
        <LossField
          label="ACKs to be lost"
          value={form.lostAcks}
          error={errors.lostAcks}
          total={total}
          onChange={(v) => change("lostAcks", v)}
        />
      </section>

      <button
        type="button"
        onClick={onRun}
        disabled={hasErrors}
        className="w-full rounded-lg bg-frame px-4 py-3 text-sm font-semibold text-white shadow transition hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:bg-ink/25 disabled:shadow-none"
      >
        {hasErrors ? "Fix the errors above to run" : "Save"}
      </button>
    </div>
  );
}
