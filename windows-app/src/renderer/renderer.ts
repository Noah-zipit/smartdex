/* SmartDex renderer — plain script, no frameworks, no build step beyond tsc. */

interface SmartDexApi {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getState(): Promise<{ state: string; rebootNeeded: boolean }>;
  getChecklist(): Promise<Record<string, boolean>>;
  onLog(cb: (text: string) => void): void;
  onState(cb: (state: string, detail?: string) => void): void;
  onReboot(cb: (needed: boolean) => void): void;
}

declare const smartdex: SmartDexApi;

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
};

const logEl = $("log") as HTMLPreElement;
const statusDot = $("status-dot");
const statusText = $("status-text");
const connectBtn = $("connect") as HTMLButtonElement;
const disconnectBtn = $("disconnect") as HTMLButtonElement;
const refreshBtn = $("refresh") as HTMLButtonElement;
const errorBox = $("error");
const rebootBanner = $("reboot-banner");

function appendLog(text: string): void {
  logEl.textContent += text + "\n";
  logEl.scrollTop = logEl.scrollHeight;
  // Keep the log from eating memory on long sessions.
  const lines = logEl.textContent.split("\n");
  if (lines.length > 2000) logEl.textContent = lines.slice(-2000).join("\n");
}

function setStatus(state: string, detail?: string): void {
  statusText.textContent = detail ? `${state} — ${detail}` : state;
  statusDot.className = "dot " + (state === "connected" ? "ok" : state === "connecting" ? "busy" : "idle");
  connectBtn.disabled = state !== "disconnected";
  disconnectBtn.disabled = state !== "connected";
}

function showError(message?: string): void {
  if (!message) {
    errorBox.classList.add("hidden");
    errorBox.textContent = "";
    return;
  }
  errorBox.classList.remove("hidden");
  errorBox.textContent = message;
}

function renderChecklist(list: Record<string, boolean>): void {
  document.querySelectorAll<HTMLElement>(".check").forEach((el) => {
    const key = el.dataset.key ?? "";
    const ok = list[key];
    el.textContent = ok ? "✓" : "✗";
    el.classList.toggle("ok", ok);
    el.classList.toggle("bad", !ok);
  });
}

async function refreshChecklist(): Promise<void> {
  try {
    renderChecklist(await smartdex.getChecklist());
  } catch {
    /* main not ready yet; leave the ? marks */
  }
}

connectBtn.addEventListener("click", async () => {
  showError();
  rebootBanner.classList.add("hidden");
  await smartdex.connect();
  void refreshChecklist();
});

disconnectBtn.addEventListener("click", async () => {
  await smartdex.disconnect();
});

refreshBtn.addEventListener("click", () => void refreshChecklist());

smartdex.onLog(appendLog);

smartdex.onState((state, detail) => {
  setStatus(state, detail);
  if (state !== "disconnected") showError();
  else if (detail) showError(detail);
});

smartdex.onReboot((needed) => {
  rebootBanner.classList.toggle("hidden", !needed);
});

// Initial paint.
void (async () => {
  const { state, rebootNeeded } = await smartdex.getState();
  setStatus(state);
  rebootBanner.classList.toggle("hidden", !rebootNeeded);
  await refreshChecklist();
})();
