const byId = (id) => document.getElementById(id);
const statusLine = byId("status");
const sample = byId("sample");
const intervals = [];
let lastKeyTime = null;
let tabId;
let profile = null;

async function command(action, options = {}) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (action, options) => globalThis.steadyType?.(action, options),
    args: [action, options],
  });
  return result.result;
}

function show(state) {
  if (!state) return;
  byId("toggle").textContent = state.phase === "Paused" ? "Resume" : "Pause";
  statusLine.textContent = state.message || state.phase;
}

async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab.id;
  const { draft, settings, paceProfile } = await chrome.storage.local.get([
    "draft", "settings", "paceProfile",
  ]);
  byId("text").value = draft ?? "";
  if (settings) {
    byId("wpm").value = settings.wpm;
    byId("pause").value = settings.pause;
    byId("rich").checked = settings.rich;
  }
  profile = paceProfile ?? null;
  show(await command("status"));
}

const ready = initialize();
ready.catch(() => {
  statusLine.textContent = "Open a regular web page to use SteadyType.";
});

byId("text").addEventListener("input", () => {
  void chrome.storage.local.set({ draft: byId("text").value });
});

function readSettings() {
  return {
    wpm: byId("wpm").valueAsNumber,
    pause: byId("pause").valueAsNumber,
    rich: byId("rich").checked,
  };
}

for (const id of ["wpm", "pause", "rich"]) {
  byId(id).addEventListener("change", () => {
    const settings = readSettings();
    if (byId("wpm").checkValidity() && byId("pause").checkValidity() &&
        Number.isFinite(settings.wpm) && Number.isFinite(settings.pause)) {
      void chrome.storage.local.set({ settings });
    }
  });
}

for (const [id, action] of [["start", "start"], ["toggle", "toggle"], ["stop", "stop"]]) {
  byId(id).addEventListener("click", async () => {
    try {
      await ready;
      if (action === "start") {
        const text = byId("text").value;
        if (!text.length) throw new Error("Enter text to insert.");
        const settings = readSettings();
        if (!byId("wpm").reportValidity() || !byId("pause").reportValidity()) return;
        if (!Number.isFinite(settings.wpm) || !Number.isFinite(settings.pause)) {
          throw new Error("Enter a speed and sentence pause.");
        }
        await chrome.scripting.executeScript({ target: { tabId }, files: ["engine.js"] });
        show(await command(action, { ...settings, text, profile }));
      } else {
        show(await command(action) ?? { phase: "No active run." });
      }
    } catch (error) {
      statusLine.textContent = error.message;
    }
  });
}

sample.addEventListener("keydown", (event) => {
  if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey ||
      event.altKey || event.key.length !== 1) return;
  const now = performance.now();
  const gap = now - lastKeyTime;
  if (lastKeyTime !== null && gap >= 25 && gap <= 2000) {
    if (intervals.length === 200) intervals.shift();
    intervals.push(gap);
  }
  lastKeyTime = now;
});
sample.addEventListener("blur", () => { lastKeyTime = null; });

byId("calibrate").addEventListener("click", async () => {
  if (intervals.length < 15) {
    statusLine.textContent = "Type at least 16 characters at a steady pace.";
    return;
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  const quantile = (q) => sorted[Math.floor(q * (sorted.length - 1))];
  const median = quantile(0.5);
  profile = { variation: Math.min(0.5, (quantile(0.75) - quantile(0.25)) / median / 2) };
  byId("wpm").value = Math.max(5, Math.min(300, Math.round(12000 / median)));
  await chrome.storage.local.set({ paceProfile: profile, settings: readSettings() });
  sample.value = "";
  intervals.length = 0;
  statusLine.textContent = "Personal pace saved.";
});
byId("reset").addEventListener("click", async () => {
  profile = null;
  intervals.length = 0;
  sample.value = "";
  byId("wpm").value = 55;
  await chrome.storage.local.set({ paceProfile: null, settings: readSettings() });
  statusLine.textContent = "Default pace restored.";
});
