import { AI_DOMAINS, type DomainEntry } from "@/domains/ai-domains";
import { db } from "@/db/index";
import { getAuthToken, setAuthToken, clearAuthToken, validateToken, syncSessions } from "@/sync/dashboard-sync";

// --- State ---
interface DomainItem {
  entry: DomainEntry;
  enabled: boolean;
  custom: boolean;
}

let domainItems: DomainItem[] = [];

const uniqueDomains = AI_DOMAINS.filter(
  (d, i, arr) => arr.findIndex((x) => x.label === d.label) === i
);

// --- DOM refs ---
const grid = document.getElementById("domain-grid")!;
const customInput = document.getElementById("custom-input") as HTMLInputElement;
const addCustomBtn = document.getElementById("add-custom-btn")!;
const toastCheckbox = document.getElementById("toast-checkbox") as HTMLInputElement;
const ctaBtn = document.getElementById("cta")!;
const tokenInput = document.getElementById("token-input") as HTMLInputElement;
const connectBtn = document.getElementById("connect-btn")!;
const dashboardStatus = document.getElementById("dashboard-status")!;

// --- Render domain grid ---
function renderGrid() {
  grid.innerHTML = "";
  for (let i = 0; i < domainItems.length; i++) {
    const item = domainItems[i];
    const label = document.createElement("label");
    label.className = "domain-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.enabled;
    checkbox.addEventListener("change", () => {
      item.enabled = checkbox.checked;
    });

    const span = document.createElement("span");
    span.className = "domain-label";
    span.textContent = item.entry.label;

    label.appendChild(checkbox);
    label.appendChild(span);
    grid.appendChild(label);
  }
}

// --- Init: load saved settings or default all-checked ---
async function init() {
  const savedConfig = await db.config.get("enabledDomains");
  const savedCustom = await db.customDomains.toArray();
  const toastConfig = await db.config.get("toastEnabled");

  if (savedConfig?.value) {
    const enabled = savedConfig.value as DomainEntry[];
    const enabledLabels = new Set(enabled.map((d) => d.label));
    domainItems = uniqueDomains.map((entry) => ({
      entry,
      enabled: enabledLabels.has(entry.label),
      custom: false,
    }));
  } else {
    domainItems = uniqueDomains.map((entry) => ({
      entry,
      enabled: true,
      custom: false,
    }));
  }

  for (const cd of savedCustom) {
    domainItems.push({
      entry: { hostname: cd.hostname, label: cd.label },
      enabled: true,
      custom: true,
    });
  }

  if (toastConfig?.value === true) {
    toastCheckbox.checked = true;
  }

  renderGrid();
}

init();

// --- Add custom domain ---
function addCustomDomain() {
  const raw = customInput.value.trim().toLowerCase();
  if (!raw) return;

  // Strip protocol if user pasted a full URL
  let hostname = raw;
  try {
    if (raw.includes("://")) {
      hostname = new URL(raw).hostname;
    }
  } catch {
    // keep as-is
  }

  // Check for duplicates
  const exists = domainItems.some(
    (d) => d.entry.hostname === hostname
  );
  if (exists) {
    customInput.value = "";
    return;
  }

  domainItems.push({
    entry: { hostname, label: hostname },
    enabled: true,
    custom: true,
  });

  customInput.value = "";
  renderGrid();
}

addCustomBtn.addEventListener("click", addCustomDomain);
customInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addCustomDomain();
  }
});

// --- Dashboard connection ---
async function updateDashboardStatus() {
  const token = await getAuthToken();
  if (token) {
    dashboardStatus.textContent = "Connected to dashboard";
    dashboardStatus.className = "dashboard-status connected";
    tokenInput.value = "";
    tokenInput.placeholder = "••••••••";
    tokenInput.disabled = true;
    connectBtn.textContent = "Disconnect";
    connectBtn.onclick = async () => {
      await clearAuthToken();
      tokenInput.disabled = false;
      tokenInput.placeholder = "Paste your dashboard token";
      connectBtn.textContent = "Connect";
      connectBtn.onclick = handleConnect;
      updateDashboardStatus();
    };
  } else {
    dashboardStatus.textContent = "";
    dashboardStatus.className = "dashboard-status";
    tokenInput.disabled = false;
    connectBtn.textContent = "Connect";
    connectBtn.onclick = handleConnect;
  }
}

async function handleConnect() {
  const token = tokenInput.value.trim();
  if (!token) {
    dashboardStatus.textContent = "Please paste a token";
    dashboardStatus.className = "dashboard-status error";
    return;
  }

  connectBtn.textContent = "Connecting…";
  connectBtn.disabled = true;

  try {
    const valid = await validateToken(token);
    if (!valid) {
      dashboardStatus.textContent = "Invalid token — check and try again";
      dashboardStatus.className = "dashboard-status error";
      connectBtn.disabled = false;
      connectBtn.textContent = "Connect";
      return;
    }

    await setAuthToken(token);
    await syncSessions();
    dashboardStatus.textContent = "Connected — syncing sessions";
    dashboardStatus.className = "dashboard-status success";
  } catch {
    dashboardStatus.textContent = "Connection failed — check your network";
    dashboardStatus.className = "dashboard-status error";
  }

  connectBtn.disabled = false;
  updateDashboardStatus();
}

connectBtn.addEventListener("click", handleConnect);
updateDashboardStatus();

// --- CTA ---
ctaBtn.addEventListener("click", async () => {
  // 1. Collect enabled built-in domains (expand labels back to all hostnames)
  const enabledLabels = new Set(
    domainItems.filter((d) => d.enabled && !d.custom).map((d) => d.entry.label)
  );
  const enabledBuiltIn = AI_DOMAINS.filter((d) => enabledLabels.has(d.label));

  // 2. Collect custom domains
  const customDomains = domainItems.filter((d) => d.enabled && d.custom);

  // 3. Save enabled domains to config
  await db.config.put({
    key: "enabledDomains",
    value: enabledBuiltIn,
  });

  // 4. Save custom domains to customDomains table
  for (const cd of customDomains) {
    await db.customDomains.put({
      hostname: cd.entry.hostname,
      label: cd.entry.label,
      addedAt: Date.now(),
    });
  }

  // 5. Handle toast opt-in/out
  if (toastCheckbox.checked) {
    try {
      const granted = await chrome.permissions.request({
        origins: ["<all_urls>"],
      });
      if (granted) {
        await db.config.put({ key: "toastEnabled", value: true });
      }
    } catch (e) {
      console.error("[rippl] permission request failed", e);
    }
  } else {
    await db.config.put({ key: "toastEnabled", value: false });
  }

  // 6. Close tab
  window.close();
});
