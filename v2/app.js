(() => {
  const STORAGE_KEY = "opsDashboardConfig.v1";

  const panelOrder = [
    { id: "leftTop", label: "Left 1 (Camera/Feed)" },
    { id: "leftMiddle", label: "Left 2 (Camera/Feed)" },
    { id: "leftBottom", label: "Left 3 (Camera/Feed)" },
    { id: "centerTop", label: "Center Top" },
    { id: "centerBottom", label: "Center Bottom" },
    { id: "rightTop", label: "Right Top" },
    { id: "rightBottom", label: "Right Bottom" },
  ];

  const defaultConfig = {
    name: "Weather & Operations Dashboard",
    refreshIntervalSec: 600,
    columnsPct: [35, 40, 25],
    panels: {
      leftTop: `<iframe src="https://webcam.io/webcams/MpbQgP?embed=true" loading="lazy"></iframe>`,
      leftMiddle: `<iframe src="https://player.twitch.tv/?channel=5newswdtv&parent=dlukekopp.github.io" allowfullscreen="true" scrolling="no"></iframe>`,
      leftBottom: `<iframe src="https://vtc1.roadsummary.com/rtplive/CAM001/playlist.m3u8" loading="lazy"></iframe>`,
      centerTop: `<iframe src="https://embed.ventusky.com/?p=38.98;-81.21;7&l=radar&m=hrrr" loading="lazy"></iframe>`,
      centerBottom: `<iframe src="https://www.weather.gov/rlx/briefing" loading="lazy"></iframe>`,
      rightTop: `<iframe src="https://www.weather.gov/rlx/" loading="lazy"></iframe>`,
      rightBottom: `<iframe src="https://www.broadcastify.com/webPlayer/40500" loading="lazy"></iframe>`,
    }
  };

  // -------- Utilities
  const $ = (sel) => document.querySelector(sel);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultConfig);
      const parsed = JSON.parse(raw);
      return mergeConfig(structuredClone(defaultConfig), parsed);
    } catch {
      return structuredClone(defaultConfig);
    }
  }

  function saveConfig(cfg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }

  function mergeConfig(base, incoming) {
    const out = base;

    if (typeof incoming?.name === "string") out.name = incoming.name;
    if (Number.isFinite(incoming?.refreshIntervalSec)) out.refreshIntervalSec = incoming.refreshIntervalSec;

    if (Array.isArray(incoming?.columnsPct) && incoming.columnsPct.length === 3) {
      out.columnsPct = incoming.columnsPct.map((x) => Number(x) || 0);
    }

    if (incoming?.panels && typeof incoming.panels === "object") {
      for (const k of Object.keys(out.panels)) {
        if (typeof incoming.panels[k] === "string") out.panels[k] = incoming.panels[k];
      }
    }
    return out;
  }

  function normalizeColumns(cols) {
    let [a,b,c] = cols.map((x) => clamp(Math.round(Number(x) || 0), 5, 90));
    const sum = a+b+c;
    if (sum === 100) return [a,b,c];

    // Normalize proportionally to 100
    const scale = 100 / sum;
    a = Math.round(a * scale);
    b = Math.round(b * scale);
    c = 100 - a - b;
    c = clamp(c, 5, 90);

    // If clamping broke total, adjust center
    const total = a+b+c;
    if (total !== 100) {
      b = clamp(b + (100 - total), 5, 90);
    }
    return [a,b,c];
  }

  function toIframeIfUrl(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) return "";

    const looksLikeIframe = trimmed.toLowerCase().includes("<iframe") && trimmed.toLowerCase().includes("src=");
    if (looksLikeIframe) return trimmed;

    // If user pasted a URL only, wrap it
    const looksLikeUrl = /^https?:\/\/\S+$/i.test(trimmed);
    if (looksLikeUrl) {
      return `<iframe src="${trimmed}" loading="lazy"></iframe>`;
    }
    // Otherwise assume they pasted HTML; keep as-is (inside the panel container)
    return trimmed;
  }

  function setCSSColumns(colsPct) {
    const [a,b,c] = normalizeColumns(colsPct);
    document.documentElement.style.setProperty("--col-1", `${a}%`);
    document.documentElement.style.setProperty("--col-2", `${b}%`);
    document.documentElement.style.setProperty("--col-3", `${c}%`);
  }

  function renderDashboard(cfg) {
    // Title
    $("#dashboardTitle").textContent = cfg.name || "Operations Dashboard";
    document.title = cfg.name || "Operations Dashboard";

    // Columns
    setCSSColumns(cfg.columnsPct);

    // Panels
    for (const {id} of panelOrder) {
      const el = $(`#panel-${id}`);
      if (!el) continue;
      el.innerHTML = cfg.panels[id] || "";
    }
  }

  // -------- Clock & refresh countdown
  let refreshTimer = null;
  let countdownTimer = null;
  let remaining = 0;
  let editing = false;

  function startTimers(cfg) {
    stopTimers();
    remaining = Math.max(30, Number(cfg.refreshIntervalSec) || 600);

    const tickClock = () => {
      const now = new Date();
      $("#localTime").textContent = now.toLocaleTimeString([], { hour12: true });
    };
    tickClock();
    setInterval(tickClock, 1000);

    const tickCountdown = () => {
      $("#refreshCountdown").textContent = String(remaining);
      remaining -= 1;
      if (remaining < 0) remaining = 0;

      if (!editing && remaining === 0) {
        location.reload();
      }
    };
    tickCountdown();
    countdownTimer = setInterval(tickCountdown, 1000);

    refreshTimer = setTimeout(() => {
      if (!editing) location.reload();
    }, (Math.max(30, Number(cfg.refreshIntervalSec) || 600)) * 1000);
  }

  function stopTimers() {
    if (refreshTimer) clearTimeout(refreshTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    refreshTimer = null;
    countdownTimer = null;
  }

  // -------- Editor UI
  const drawer = $("#drawer");
  const toggleEditBtn = $("#toggleEditBtn");
  const closeDrawerBtn = $("#closeDrawerBtn");
  const saveBtn = $("#saveBtn");
  const discardBtn = $("#discardBtn");
  const exportBtn = $("#exportBtn");
  const importBtn = $("#importBtn");
  const resetBtn = $("#resetBtn");

  const nameInput = $("#nameInput");
  const refreshInput = $("#refreshInput");
  const col1 = $("#col1");
  const col2 = $("#col2");
  const col3 = $("#col3");
  const panelList = $("#panelList");

  // Modal
  const modal = $("#modal");
  const modalTitle = $("#modalTitle");
  const modalTextarea = $("#modalTextarea");
  const modalHint = $("#modalHint");
  const modalClose = $("#modalClose");
  const modalConfirm = $("#modalConfirm");

  let cfg = loadConfig();
  let draft = structuredClone(cfg);

  function openDrawer() {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    editing = true;
  }

  function closeDrawer() {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    editing = false;
    // reset countdown to avoid “instant reload”
    remaining = Math.max(5, remaining);
  }

  function setEditMode(on) {
    document.body.classList.toggle("edit-mode", on);
    if (on) openDrawer();
    else closeDrawer();
    toggleEditBtn.textContent = on ? "Exit Edit" : "Edit Mode";
  }

  function hydrateEditorFromDraft() {
    nameInput.value = draft.name || "";
    refreshInput.value = String(draft.refreshIntervalSec ?? 600);

    const cols = normalizeColumns(draft.columnsPct || [35,40,25]);
    col1.value = String(cols[0]);
    col2.value = String(cols[1]);
    col3.value = String(cols[2]);

    panelList.innerHTML = "";
    for (const {id, label} of panelOrder) {
      const wrapper = document.createElement("div");
      wrapper.className = "panel-item";
      wrapper.innerHTML = `
        <div class="panel-item-head">
          <div>
            <div class="panel-item-title">${label}</div>
            <div class="panel-item-id">${id}</div>
          </div>
        </div>
        <textarea data-panel-input="${id}" placeholder="Paste iframe HTML or a URL..."></textarea>
        <div class="hint" data-panel-hint="${id}"></div>
      `;
      panelList.appendChild(wrapper);

      const ta = wrapper.querySelector(`textarea[data-panel-input="${id}"]`);
      ta.value = draft.panels[id] || "";

      // lightweight “twitch parent” reminder
      const hintEl = wrapper.querySelector(`[data-panel-hint="${id}"]`);
      ta.addEventListener("input", () => {
        const val = ta.value || "";
        if (val.includes("player.twitch.tv")) {
          if (!/parent=/.test(val)) {
            hintEl.textContent = "Twitch note: add parent=YOUR_GITHUB_DOMAIN (e.g., dlukekopp.github.io) or the embed will be blocked.";
          } else {
            hintEl.textContent = "";
          }
        } else {
          hintEl.textContent = "";
        }
      });
      ta.dispatchEvent(new Event("input"));
    }
  }

  function readDraftFromEditor() {
    draft.name = nameInput.value.trim() || "Operations Dashboard";
    draft.refreshIntervalSec = clamp(Number(refreshInput.value) || 600, 30, 3600);

    draft.columnsPct = normalizeColumns([
      Number(col1.value),
      Number(col2.value),
      Number(col3.value),
    ]);

    for (const {id} of panelOrder) {
      const ta = document.querySelector(`textarea[data-panel-input="${id}"]`);
      if (!ta) continue;
      draft.panels[id] = toIframeIfUrl(ta.value);
    }
  }

  // Presets
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-preset]");
    if (!btn) return;
    const preset = btn.getAttribute("data-preset");
    if (preset === "cameras") {
      col1.value = "45"; col2.value = "35"; col3.value = "20";
    } else if (preset === "balanced") {
      col1.value = "35"; col2.value = "40"; col3.value = "25";
    } else if (preset === "weather") {
      col1.value = "28"; col2.value = "50"; col3.value = "22";
    }
  });

  // Panel “Edit” buttons on tiles jump you into drawer
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-edit]");
    if (!btn) return;
    const panelId = btn.getAttribute("data-edit");
    setEditMode(true);
    // Focus that panel’s textarea
    setTimeout(() => {
      const ta = document.querySelector(`textarea[data-panel-input="${panelId}"]`);
      if (ta) ta.focus();
    }, 50);
  });

  toggleEditBtn.addEventListener("click", () => {
    const on = !document.body.classList.contains("edit-mode");
    if (on) {
      draft = structuredClone(cfg);
      hydrateEditorFromDraft();
    }
    setEditMode(on);
  });

  closeDrawerBtn.addEventListener("click", () => setEditMode(false));
  discardBtn.addEventListener("click", () => setEditMode(false));

  saveBtn.addEventListener("click", () => {
    readDraftFromEditor();
    cfg = structuredClone(draft);
    saveConfig(cfg);
    renderDashboard(cfg);
    setEditMode(false);
    startTimers(cfg);
  });

  resetBtn.addEventListener("click", () => {
    cfg = structuredClone(defaultConfig);
    draft = structuredClone(cfg);
    saveConfig(cfg);
    renderDashboard(cfg);
    startTimers(cfg);
    if (document.body.classList.contains("edit-mode")) hydrateEditorFromDraft();
  });

  // Export
  exportBtn.addEventListener("click", async () => {
    modalTitle.textContent = "Export Configuration";
    modalTextarea.value = JSON.stringify(cfg, null, 2);
    modalHint.textContent = "Copy this JSON and save it somewhere. You can Import it on another computer.";
    modalConfirm.textContent = "Copy to Clipboard";
    openModal();

    modalConfirm.onclick = async () => {
      try {
        await navigator.clipboard.writeText(modalTextarea.value);
        modalHint.textContent = "Copied to clipboard.";
      } catch {
        modalHint.textContent = "Copy manually (clipboard not available in this browser context).";
      }
    };
  });

  // Import
  importBtn.addEventListener("click", () => {
    modalTitle.textContent = "Import Configuration";
    modalTextarea.value = "";
    modalHint.textContent = "Paste a previously exported JSON config here.";
    modalConfirm.textContent = "Import";
    openModal();

    modalConfirm.onclick = () => {
      try {
        const parsed = JSON.parse(modalTextarea.value);
        cfg = mergeConfig(structuredClone(defaultConfig), parsed);
        saveConfig(cfg);
        renderDashboard(cfg);
        startTimers(cfg);
        closeModal();
        if (document.body.classList.contains("edit-mode")) {
          draft = structuredClone(cfg);
          hydrateEditorFromDraft();
        }
      } catch {
        modalHint.textContent = "That didn’t parse as valid JSON. Double-check formatting and try again.";
      }
    };
  });

  function openModal() {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }
  function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
  modalClose.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  // -------- Init
  renderDashboard(cfg);
  startTimers(cfg);

})();


