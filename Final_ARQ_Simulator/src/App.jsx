// The main page. It keeps all the important values (state) and
// passes them down to the smaller components.
import { useEffect, useRef, useState } from "react";
import { runSimulation, PROTOCOL_NAMES } from "./simulator.js";
import { checkForm, PRESETS, MAX_FRAMES, countUpTo } from "./formHelpers.js";

import ConfigPanel from "./components/ConfigPanel.jsx";
import Controls from "./components/Controls.jsx";
import Channel from "./components/Channel.jsx";
import Windows from "./components/Windows.jsx";
import TimeSpace from "./components/TimeSpace.jsx";
import LogPanel from "./components/LogPanel.jsx";
import Stats from "./components/Stats.jsx";
import Compare from "./components/Compare.jsx";

const UNITS_PER_SECOND = 2; // at speed 1x, 2 simulated time units pass every real second

// The page starts with the Go-Back-N example already loaded
const START_FORM = PRESETS[1].form;

export default function App() {
  const [form, setForm] = useState(START_FORM);
  const [result, setResult] = useState(() => runSimulation(checkForm(START_FORM).config));

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timeRef = useRef(0); // same value as "time", but readable inside the animation loop

  const { errors } = checkForm(form);
  const end = result.finalTime;

  function changeTime(value) {
    timeRef.current = value;
    setTime(value);
  }

  // ----- the animation loop -----
  useEffect(() => {
    if (!playing) return;

    let last = performance.now();
    let frameId = 0;

    function tick(now) {
      const seconds = Math.min((now - last) / 1000, 0.1);
      last = now;
      const next = Math.min(timeRef.current + seconds * speed * UNITS_PER_SECOND, end);
      changeTime(next);
      if (next >= end) {
        setPlaying(false);
        return;
      }
      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [playing, speed, end]);

  // ----- buttons -----
  function runWith(formToRun) {
    const checked = checkForm(formToRun);
    if (!checked.config) return;
    setResult(runSimulation(checked.config));
    changeTime(0);
    setPlaying(false); // wait for the user to press Play
  }

  function handlePreset(presetForm) {
    setForm(presetForm);
    runWith(presetForm);
  }

  function handlePlay() {
    if (timeRef.current >= end) changeTime(0);
    setPlaying(true);
  }

  function handleStep() {
    setPlaying(false);
    const next = result.snapshots.find((s) => s.time > timeRef.current + 1e-9);
    changeTime(next ? next.time : end);
  }

  function handleBack() {
    setPlaying(false);
    const earlier = result.snapshots.filter((s) => s.time < timeRef.current - 1e-9);
    changeTime(earlier.length > 0 ? earlier[earlier.length - 1].time : 0);
  }

  function handleSeek(value) {
    setPlaying(false);
    changeTime(value);
  }

  function handleReset() {
    setPlaying(false);
    changeTime(0);
  }

  // ----- what to show at the current time -----
  const snapshotIndex = Math.max(0, countUpTo(result.snapshots, time) - 1);
  const snapshot = result.snapshots[snapshotIndex];
  const shownLogs = countUpTo(result.logs, time);
  const latest = shownLogs > 0 ? result.logs[shownLogs - 1] : null;
  const finished = time >= end;

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">ARQ Protocol Simulator</h1>
        <p className="mt-1 max-w-2xl text-ink/70">
          Watch data frames and acknowledgements travel across a noisy channel. Pick a protocol, choose which
          packets get lost, and see how each one recovers.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        {/* left column */}
        <aside className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto scroll-smooth">
          <ConfigPanel
            form={form}
            setForm={setForm}
            errors={errors}
            total={Number(form.totalFrames) >= 1 && Number(form.totalFrames) <= MAX_FRAMES ? Number(form.totalFrames) : 0}
            onRun={() => runWith(form)}
            onPreset={handlePreset}
          />
        </aside>

        {/* right column */}
        <main className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="text-xl font-semibold">{PROTOCOL_NAMES[result.config.protocol]}</h2>
            <p className="font-mono text-xs text-ink/60">
              {result.config.totalFrames} frames, sequence numbers 0 to {result.sequenceSpace - 1}, sender window{" "}
              {result.config.senderWindow}, receiver window {result.config.receiverWindow}
            </p>
          </div>

          <Controls
            time={time}
            end={end}
            playing={playing}
            speed={speed}
            onPlay={handlePlay}
            onPause={() => setPlaying(false)}
            onStep={handleStep}
            onBack={handleBack}
            onReset={handleReset}
            onSeek={handleSeek}
            onSpeed={setSpeed}
          />

          <Channel packets={result.packets} time={time} snapshot={snapshot} config={result.config} latest={latest} />

          <Windows snapshot={snapshot} config={result.config} time={time} sequenceSpace={result.sequenceSpace} />

          <div className="space-y-5">
            <TimeSpace packets={result.packets} logs={result.logs} time={time} finalTime={end} />
            <LogPanel logs={result.logs} shown={shownLogs} result={result} />
          </div>

          <Stats stats={snapshot.stats} result={result} finished={finished} />

          <Compare config={result.config} />
        </main>
      </div>

      <footer className="mt-10 border-t border-line pt-4 text-xs text-ink/55">
        The simulation logic is a direct translation of the C++ ARQ program. Frame time = 1, propagation delay = 2,
        timeout = 8 time units.
      </footer>
    </div>
  );
}
