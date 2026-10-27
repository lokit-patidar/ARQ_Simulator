// =====================================================================
//  Helpers for the input form.
//  They do the same checks that the C++ program does with readNumber()
//  and readList(), but they show the error on screen instead of
//  asking the question again.
// =====================================================================

// The C++ program allows 100000 frames. The website draws every frame,
// so we keep the limit smaller to keep the page fast.
export const MAX_FRAMES = 200;

// Ready-made examples (the buttons on the left side of the page)
export const PRESETS = [
  {
    name: "Stop-and-Wait",
    note: "Frame 2 and ACK 3 are lost",
    form: { protocol: 1, totalFrames: "6", seqBits: "1", senderWindow: "1", receiverWindow: "1", lostFrames: "2", lostAcks: "3" },
  },
  {
    name: "Go-Back-N",
    note: "Frames 3 and 7 lost, ACK 5 lost",
    form: { protocol: 2, totalFrames: "10", seqBits: "3", senderWindow: "4", receiverWindow: "1", lostFrames: "3, 7", lostAcks: "5" },
  },
  {
    name: "Selective Repeat",
    note: "Frames 3 and 7 lost, ACK 5 lost",
    form: { protocol: 3, totalFrames: "10", seqBits: "3", senderWindow: "4", receiverWindow: "4", lostFrames: "3, 7", lostAcks: "5" },
  },
];

// "12" -> 12      "abc" -> NaN      "1.5" -> NaN
function toWhole(text) {
  const t = String(text).trim();
  if (!/^[+-]?\d+$/.test(t)) return NaN;
  return Number(t);
}

// "3, 7  9" -> { list: [3, 7, 9], error: "" }
export function parseList(text, frameCount) {
  const words = String(text).replace(/,/g, " ").split(/\s+/).filter((w) => w !== "");
  const result = new Set();

  for (const word of words) {
    if (word.toLowerCase() === "none" || word === "-") continue;
    const n = toWhole(word);
    if (Number.isNaN(n) || n < 0 || n >= frameCount) {
      return {
        list: [],
        error: "Invalid entry '" + word + "': use whole numbers from 0 to " + (frameCount - 1) + ".",
      };
    }
    result.add(n);
  }
  return { list: [...result].sort((a, b) => a - b), error: "" };
}

// Click on a frame chip: add it to the list, or remove it if it is already there.
export function toggleInList(text, number) {
  const parsed = parseList(text, 1000000);
  const list = parsed.error ? [] : parsed.list;
  const index = list.indexOf(number);
  if (index >= 0) list.splice(index, 1);
  else list.push(number);
  list.sort((a, b) => a - b);
  return list.join(", ");
}

// Check the whole form.
// Returns { errors: {...}, config: {...} }.  config is null when something is wrong.
export function checkForm(form) {
  const errors = {};
  const protocol = Number(form.protocol);
  const totalFrames = toWhole(form.totalFrames);
  const seqBits = toWhole(form.seqBits);
  let senderWindow = 1;
  let receiverWindow = 1;

  if (Number.isNaN(totalFrames)) {
    errors.totalFrames = "Please enter a whole number.";
  } else if (totalFrames < 1 || totalFrames > MAX_FRAMES) {
    errors.totalFrames = "Total number of frames must be between 1 and " + MAX_FRAMES + ".";
  }

  if (Number.isNaN(seqBits)) {
    errors.seqBits = "Please enter a whole number.";
  } else if (seqBits < 1 || seqBits > 16) {
    errors.seqBits = "Sequence number bits must be between 1 and 16.";
  }

  // Window sizes depend on the number of sequence bits
  if (!errors.seqBits && protocol !== 1) {
    const space = 2 ** seqBits;

    if (protocol === 2) {
      const max = space - 1;
      senderWindow = toWhole(form.senderWindow);
      if (Number.isNaN(senderWindow) || senderWindow < 1 || senderWindow > max) {
        errors.senderWindow = "Go-Back-N sender window must be between 1 and " + max + " (2^m - 1).";
      }
    }

    if (protocol === 3) {
      const max = space / 2;
      senderWindow = toWhole(form.senderWindow);
      receiverWindow = toWhole(form.receiverWindow);
      if (Number.isNaN(senderWindow) || senderWindow < 1 || senderWindow > max) {
        errors.senderWindow = "Selective Repeat sender window must be between 1 and " + max + " (2^(m-1)).";
      }
      if (Number.isNaN(receiverWindow) || receiverWindow < 1 || receiverWindow > max) {
        errors.receiverWindow = "Selective Repeat receiver window must be between 1 and " + max + " (2^(m-1)).";
      }
    }
  }

  let lostFrames = [];
  let lostAcks = [];
  if (!errors.totalFrames) {
    const a = parseList(form.lostFrames, totalFrames);
    const b = parseList(form.lostAcks, totalFrames);
    if (a.error) errors.lostFrames = a.error;
    if (b.error) errors.lostAcks = b.error;
    lostFrames = a.list;
    lostAcks = b.list;
  }

  if (Object.keys(errors).length > 0) return { errors: errors, config: null };

  return {
    errors: errors,
    config: { protocol, totalFrames, seqBits, senderWindow, receiverWindow, lostFrames, lostAcks },
  };
}

// ---------------------------------------------------------------------
//  Small helpers used while the animation plays
// ---------------------------------------------------------------------

// Number of items in a sorted list whose "time" is <= t
export function countUpTo(list, t) {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (list[mid].time <= t) low = mid + 1;
    else high = mid;
  }
  return low;
}
