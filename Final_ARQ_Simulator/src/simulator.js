// =====================================================================
//  ARQ SIMULATOR  (the "brain" of the website)
//
//  This file is a direct translation of the C++ program into JavaScript.
//  The function names, variable names and the order of steps are the same
//  as in the C++ code, so you can read both side by side.
//
//  It does NOT draw anything. It only runs the simulation and returns:
//    - logs       : every line of the transmission log
//    - packets    : every frame / ACK that travelled on the channel
//    - snapshots  : the state of sender and receiver after every event
//    - stats      : the performance numbers
// =====================================================================

// ---------- Timing model (same as C++) ----------
export const FRAME_TIME = 1.0;
export const PROP_DELAY = 2.0;
export const TIMEOUT_TIME = 8.0;

// ---------- Protocol numbers ----------
export const STOP_AND_WAIT = 1;
export const GO_BACK_N = 2;
export const SELECTIVE_REPEAT = 3;

export const PROTOCOL_NAMES = {
  1: "Stop-and-Wait",
  2: "Go-Back-N",
  3: "Selective Repeat",
};

// ---------- Event types ----------
const SENDER_FREE = 0;
const FRAME_ARRIVE = 1;
const ACK_ARRIVE = 2;
const TIMER_EXPIRE = 3;

// config looks like this:
// {
//   protocol, totalFrames, seqBits, senderWindow, receiverWindow,
//   lostFrames: [3, 7],   lostAcks: [5]
// }
export function runSimulation(config) {
  const lostFrames = new Set(config.lostFrames);
  const lostAcks = new Set(config.lostAcks);
  const total = config.totalFrames;
  const sequenceSpace = 2 ** config.seqBits;

  // ----- results we collect for the website -----
  const stats = {
    delivered: 0,
    attempts: 0,
    retransmissions: 0,
    discarded: 0,
    framesLost: 0,
    acksLost: 0,
    acksGenerated: 0,
    timeouts: 0,
    time: 0,
  };
  const logs = []; // { time, text, kind, frame }
  const packets = []; // { kind: "frame" | "ack", frame, sentAt, arriveAt, lost, retransmission }
  const snapshots = []; // state of the sender and receiver after each event

  // ----- shared variables (same as C++) -----
  const events = [];
  const frameAttempts = new Array(total).fill(0);
  const ackAttempts = new Array(total).fill(0);
  const timerTokens = new Array(total).fill(0);
  const timerExpiry = new Array(total).fill(0); // extra: only used to show timers on screen

  let currentTime = 0;
  let senderFreeAt = 0;
  let eventOrder = 0;
  let nextTimerToken = 0;
  let nextFrameToDeliver = 0;
  let integrityOk = true;
  let completed = false;
  let stalled = false;

  // Stop-and-Wait variables
  let swCurrent = 0;
  let swExpected = 0;
  let swWaiting = false;
  let swNeedsRetransmission = false;

  // Go-Back-N variables
  let gbnBase = 0;
  let gbnNextToSend = 0;
  let gbnExpected = 0;
  // Each GBN frame has its own timer (started when that frame is sent).
  // Timeout fires when the OLDEST unacked frame (gbnBase) times out → retransmit all.

  // Selective Repeat variables
  let srBase = 0;
  let srNextToSend = 0;
  let srReceiverBase = 0;
  const srAcked = new Array(total).fill(0);
  const srReceived = new Array(total).fill(0);
  const srRetransmissionQueue = [];

  // ---------------------------------------------------------------
  //  Small helper functions
  // ---------------------------------------------------------------

  // Put an event in the queue (the C++ priority_queue)
  function addEvent(type, time, frame = -1, token = 0) {
    events.push({ time: time, order: eventOrder++, type: type, frame: frame, timerToken: token });
  }

  // Take out the event that happens first (smallest time, then smallest order)
  function popNextEvent() {
    let best = 0;
    for (let i = 1; i < events.length; i++) {
      const a = events[i];
      const b = events[best];
      if (a.time < b.time || (a.time === b.time && a.order < b.order)) best = i;
    }
    return events.splice(best, 1)[0];
  }

  function frameName(frame) {
    return "Frame " + frame;
  }

  function ackName(frame) {
    return "ACK " + frame;
  }

  function sequenceText(frame) {
    return " (seq " + (frame % sequenceSpace) + ")";
  }

  // Write one line in the log. "kind" is only used to pick a colour on screen.
  function say(message, kind = "info", frame = -1) {
    logs.push({ time: currentTime, text: message, kind: kind, frame: frame });
  }

  function senderIsBusy() {
    return currentTime < senderFreeAt;
  }

  function startTimer(frame) {
    timerTokens[frame] = ++nextTimerToken;
    timerExpiry[frame] = currentTime + TIMEOUT_TIME;
    addEvent(TIMER_EXPIRE, currentTime + TIMEOUT_TIME, frame, timerTokens[frame]);
  }

  function stopTimer(frame) {
    timerTokens[frame] = 0;
  }

  // ---------------------------------------------------------------
  //  Sending and receiving on the channel
  // ---------------------------------------------------------------

  function sendFrame(frame) {
    const retransmission = frameAttempts[frame] > 0;
    const isLost = !retransmission && lostFrames.has(frame);

    frameAttempts[frame]++;
    stats.attempts++;
    if (retransmission) stats.retransmissions++;

    say(
      frameName(frame) + (retransmission ? " retransmitted" : " transmitted") + sequenceText(frame),
      retransmission ? "retransmit" : "send",
      frame
    );

    senderFreeAt = currentTime + FRAME_TIME;
    addEvent(SENDER_FREE, senderFreeAt);

    packets.push({
      kind: "frame",
      frame: frame,
      sentAt: currentTime,
      arriveAt: currentTime + FRAME_TIME + PROP_DELAY,
      lost: isLost,
      retransmission: retransmission,
    });

    if (isLost) {
      stats.framesLost++;
      say(frameName(frame) + " lost in the channel", "loss", frame);
    } else {
      addEvent(FRAME_ARRIVE, currentTime + FRAME_TIME + PROP_DELAY, frame);
    }
  }

  function sendAck(frame, note = "") {
    const isLost = ackAttempts[frame] === 0 && lostAcks.has(frame);
    ackAttempts[frame]++;
    stats.acksGenerated++;

    say(
      ackName(frame) + " generated" + sequenceText(frame) + (note === "" ? "" : " - " + note),
      "ack",
      frame
    );

    packets.push({
      kind: "ack",
      frame: frame,
      sentAt: currentTime,
      arriveAt: currentTime + PROP_DELAY,
      lost: isLost,
      retransmission: false,
    });

    if (isLost) {
      stats.acksLost++;
      say(ackName(frame) + " lost in the channel", "loss", frame);
    } else {
      addEvent(ACK_ARRIVE, currentTime + PROP_DELAY, frame);
    }
  }

  function deliverFrame(frame) {
    if (frame !== nextFrameToDeliver) {
      integrityOk = false;
      return;
    }
    nextFrameToDeliver++;
    stats.delivered++;
  }

  function discardFrame(frame, reason) {
    stats.discarded++;
    say(frameName(frame) + " discarded (" + reason + ")", "discard", frame);
  }

  function protocolFinished() {
    if (config.protocol === STOP_AND_WAIT) return swCurrent >= total;
    if (config.protocol === GO_BACK_N) return gbnBase >= total;
    return srBase >= total;
  }

  // ---------------------------------------------------------------
  //  SENDER: decide what to send next
  // ---------------------------------------------------------------

  function trySend() {
    if (senderIsBusy()) return;

    if (config.protocol === STOP_AND_WAIT) {
      if (swNeedsRetransmission) {
        swNeedsRetransmission = false;
        sendFrame(swCurrent);
        startTimer(swCurrent);
      } else if (!swWaiting && swCurrent < total) {
        swWaiting = true;
        sendFrame(swCurrent);
        startTimer(swCurrent);
      }
    } else if (config.protocol === GO_BACK_N) {
      if (gbnNextToSend < total && gbnNextToSend < gbnBase + config.senderWindow) {
        const frame = gbnNextToSend;
        gbnNextToSend++;
        sendFrame(frame);
        // Start a per-frame timer based on when THIS frame was sent.
        startTimer(frame);
      }
    } else {
      // Selective Repeat: first send frames that timed out, then new frames
      while (srRetransmissionQueue.length > 0) {
        const frame = srRetransmissionQueue.shift();
        if (!srAcked[frame]) {
          sendFrame(frame);
          startTimer(frame);
          return;
        }
      }

      if (srNextToSend < total && srNextToSend < srBase + config.senderWindow) {
        const frame = srNextToSend;
        srNextToSend++;
        sendFrame(frame);
        startTimer(frame);
      }
    }
  }

  // ---------------------------------------------------------------
  //  RECEIVER: a frame has arrived
  // ---------------------------------------------------------------

  function receiveFrame(frame) {
    if (config.protocol === STOP_AND_WAIT) {
      if (frame === swExpected) {
        say(frameName(frame) + " received successfully", "receive", frame);
        deliverFrame(frame);
        swExpected++;
        sendAck(frame);
      } else if (frame < swExpected) {
        discardFrame(frame, "duplicate frame");
        sendAck(frame, "re-sent for duplicate frame");
      } else {
        discardFrame(frame, "unexpected frame");
      }
    } else if (config.protocol === GO_BACK_N) {
      if (frame === gbnExpected) {
        say(frameName(frame) + " received successfully", "receive", frame);
        deliverFrame(frame);
        gbnExpected++;
        sendAck(frame, "cumulative");
      } else {
        discardFrame(frame, frame < gbnExpected ? "duplicate frame" : "out-of-order frame");
        if (gbnExpected > 0) sendAck(gbnExpected - 1, "cumulative, last in-order frame");
      }
    } else {
      const receiverWindow = config.receiverWindow;
      if (frame >= srReceiverBase && frame < srReceiverBase + receiverWindow) {
        if (srReceived[frame]) {
          discardFrame(frame, "duplicate frame already buffered");
          sendAck(frame, "re-sent for duplicate frame");
        } else {
          srReceived[frame] = 1;
          if (frame === srReceiverBase) {
            say(frameName(frame) + " received successfully", "receive", frame);
          } else {
            say(frameName(frame) + " received out of order, buffered in receiver window", "buffer", frame);
          }
          sendAck(frame);

          while (srReceiverBase < total && srReceived[srReceiverBase]) {
            if (srReceiverBase !== frame) {
              say(frameName(srReceiverBase) + " delivered in order from the receiver buffer", "receive", srReceiverBase);
            }
            deliverFrame(srReceiverBase);
            srReceiverBase++;
          }
        }
      } else if (frame < srReceiverBase) {
        discardFrame(frame, "duplicate frame already delivered");
        sendAck(frame, "re-sent for duplicate frame");
      } else {
        discardFrame(frame, "outside receiver window");
      }
    }
  }

  // ---------------------------------------------------------------
  //  SENDER: an ACK has arrived
  // ---------------------------------------------------------------

  function receiveAck(frame) {
    say(ackName(frame) + " received by sender", "ackrecv", frame);

    if (config.protocol === STOP_AND_WAIT) {
      if (swWaiting && frame === swCurrent) {
        stopTimer(swCurrent);
        swWaiting = false;
        swNeedsRetransmission = false;
        swCurrent++;
        trySend();
      } else {
        say("Duplicate/old ACK ignored", "info");
      }
    } else if (config.protocol === GO_BACK_N) {
      if (frame >= gbnBase) {
        if (frame > gbnBase) {
          say("Cumulative ACK: frames " + gbnBase + " to " + frame + " acknowledged", "ackrecv");
        }
        // Stop per-frame timers for every frame now acknowledged.
        for (let f = gbnBase; f <= frame; f++) stopTimer(f);
        gbnBase = frame + 1;
        if (gbnNextToSend < gbnBase) gbnNextToSend = gbnBase;
        if (gbnBase < total) {
          say("Sender window slides: oldest unacknowledged frame is now " + gbnBase, "window");
        }
      } else {
        say("Duplicate/old ACK ignored", "info");
      }
      trySend();
    } else {
      if (frame < srBase || srAcked[frame]) {
        say("Duplicate/old ACK ignored", "info");
      } else {
        srAcked[frame] = 1;
        stopTimer(frame);
        const oldBase = srBase;
        while (srBase < total && srAcked[srBase]) srBase++;
        if (srBase !== oldBase && srBase < total) {
          say("Sender window slides: oldest unacknowledged frame is now " + srBase, "window");
        }
      }
      trySend();
    }
  }

  // ---------------------------------------------------------------
  //  SENDER: a timer has expired
  // ---------------------------------------------------------------

  function handleTimeout(frame) {
    if (config.protocol === STOP_AND_WAIT) {
      if (swWaiting && frame === swCurrent) {
        say("Timeout occurred for " + frameName(swCurrent), "timeout", swCurrent);
        say("Retransmitting current unacknowledged frame (" + frameName(swCurrent) + ")", "timeout", swCurrent);
        swNeedsRetransmission = true;
        trySend();
      }
    } else if (config.protocol === GO_BACK_N) {
      // Only the oldest unacked frame (gbnBase) triggers a retransmission.
      // Timers for newer frames in the window are also cancelled before resend.
      if (frame !== gbnBase) return;
      say("Timeout occurred for " + frameName(frame) + " (oldest unacknowledged frame)", "timeout", frame);
      say(
        "Retransmitting outstanding frames (Frame " + gbnBase + " to Frame " + (gbnNextToSend - 1) + ")",
        "timeout",
        frame
      );
      // Stop all per-frame timers for the current window before retransmitting.
      for (let f = gbnBase; f < gbnNextToSend; f++) stopTimer(f);
      gbnNextToSend = gbnBase;
      trySend();
    } else {
      if (srAcked[frame]) return;
      say("Timeout occurred for " + frameName(frame), "timeout", frame);
      say("Retransmitting only the timed-out unacknowledged frame (" + frameName(frame) + ")", "timeout", frame);
      srRetransmissionQueue.push(frame);
      trySend();
    }
  }

  // ---------------------------------------------------------------
  //  Snapshot = a photo of sender and receiver at this moment.
  //  The website uses these photos to draw the windows while it plays.
  // ---------------------------------------------------------------

  function takeSnapshot() {
    let senderBase = srBase;
    let nextToSend = srNextToSend;
    let receiverBase = srReceiverBase;
    if (config.protocol === STOP_AND_WAIT) {
      senderBase = swCurrent;
      nextToSend = swWaiting ? swCurrent + 1 : swCurrent;
      receiverBase = swExpected;
    } else if (config.protocol === GO_BACK_N) {
      senderBase = gbnBase;
      nextToSend = gbnNextToSend;
      receiverBase = gbnExpected;
    }

    const acked = [];
    const received = [];
    const timers = [];
    for (let f = 0; f < total; f++) {
      if (config.protocol === SELECTIVE_REPEAT) acked.push(srAcked[f] ? 1 : 0);
      else acked.push(f < senderBase ? 1 : 0);
      received.push(config.protocol === SELECTIVE_REPEAT && srReceived[f] ? 1 : 0);
      if (timerTokens[f] !== 0) timers.push({ frame: f, expiresAt: timerExpiry[f] });
    }

    snapshots.push({
      time: currentTime,
      stats: { ...stats, time: currentTime },
      senderBase: senderBase,
      nextToSend: nextToSend,
      receiverBase: receiverBase,
      delivered: nextFrameToDeliver,
      attempts: frameAttempts.slice(),
      acked: acked,
      received: received,
      timers: timers,
    });
  }

  // ---------------------------------------------------------------
  //  The main loop (same as runSimulation in C++)
  // ---------------------------------------------------------------

  currentTime = 0;
  trySend();
  takeSnapshot();
  let processedEvents = 0;

  while (!protocolFinished() && events.length > 0) {
    if (++processedEvents > 1000000) {
      stalled = true;
      break;
    }

    const event = popNextEvent();
    currentTime = event.time;

    if (event.type === SENDER_FREE) {
      trySend();
    } else if (event.type === FRAME_ARRIVE) {
      receiveFrame(event.frame);
    } else if (event.type === ACK_ARRIVE) {
      receiveAck(event.frame);
    } else if (
      event.type === TIMER_EXPIRE &&
      event.timerToken !== 0 &&
      timerTokens[event.frame] === event.timerToken
    ) {
      timerTokens[event.frame] = 0;
      stats.timeouts++;
      handleTimeout(event.frame);
    }

    takeSnapshot();
  }

  completed = protocolFinished();
  if (!completed) stalled = true;
  stats.time = currentTime;

  const integrityPassed =
    completed && integrityOk && stats.delivered === total && nextFrameToDeliver === total;

  return {
    config: config,
    sequenceSpace: sequenceSpace,
    logs: logs,
    packets: packets,
    snapshots: snapshots,
    stats: stats,
    finalTime: currentTime,
    completed: completed,
    stalled: stalled,
    integrityPassed: integrityPassed,
  };
}

// ---------------------------------------------------------------------
//  Turn the result into the same text that the C++ program prints.
//  (Used by the "Copy log" and "Download log" buttons, handy for the report.)
// ---------------------------------------------------------------------

export function formatLogLine(entry) {
  return "[t =" + entry.time.toFixed(1).padStart(5) + "] " + entry.text;
}

export function makeTextOutput(result) {
  const config = result.config;
  const stats = result.stats;

  let text = "\n========== TRANSMISSION LOG ==========\n";
  text += "Protocol: " + PROTOCOL_NAMES[config.protocol] + "\n";
  for (const entry of result.logs) {
    text += formatLogLine(entry) + "\n";
  }

  text += "\n========== PERFORMANCE SUMMARY ==========\n";
  text += "Successfully delivered frames: " + stats.delivered + "\n";
  text += "Total transmission attempts: " + stats.attempts + "\n";
  text += "Total retransmissions: " + stats.retransmissions + "\n";
  text += "Total frames discarded: " + stats.discarded + "\n";
  text += "Total simulated time: " + stats.time.toFixed(1) + " time units\n";
  text += "\nAdditional statistics:\n";
  text +=
    "Configuration: " + config.totalFrames + " frames, " + config.seqBits +
    " sequence bits (numbers 0 to " + (result.sequenceSpace - 1) +
    "), sender window " + config.senderWindow +
    ", receiver window " + config.receiverWindow + "\n";
  text +=
    "Timing model (time units): frame transmission = " + FRAME_TIME.toFixed(1) +
    ", propagation delay = " + PROP_DELAY.toFixed(1) +
    ", timeout = " + TIMEOUT_TIME.toFixed(1) + "\n";
  text += "Data frames lost in channel: " + stats.framesLost + "\n";
  text += "ACKs generated: " + stats.acksGenerated + " (lost in channel: " + stats.acksLost + ")\n";
  text += "Timeouts: " + stats.timeouts + "\n";
  if (result.stalled) {
    text += "WARNING: the simulation stalled before all frames were acknowledged.\n";
  }
  text +=
    "Integrity check (all frames delivered in order, exactly once): " +
    (result.integrityPassed ? "PASSED" : "FAILED") + "\n";
  return text;
}
