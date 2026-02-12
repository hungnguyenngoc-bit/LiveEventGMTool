const le3Ruler = document.getElementById("le3Ruler");
const le3TrackSurface = document.getElementById("le3TrackSurface");
const le3Scroll = document.getElementById("le3Scroll");
const le3DetailPanel = document.getElementById("le3DetailPanel");
const le3DetailImages = document.getElementById("le3DetailImages");
const le3BtnNew = document.getElementById("le3BtnNew");
const le3BtnImport = document.getElementById("le3BtnImport");
const le3BtnExport = document.getElementById("le3BtnExport");
const le3BtnClear = document.getElementById("le3BtnClear");
const le3Modal = document.getElementById("le3Modal");
const le3ModalTitle = document.getElementById("le3ModalTitle");
const le3ModalBody = document.getElementById("le3ModalBody");
const le3ModalFooter = document.getElementById("le3ModalFooter");
const le3ModalClose = document.getElementById("le3ModalClose");

const STORAGE_KEY = "gm_milestone_state_v1";
const MS_PER_DAY = 86400000;
const PADDING_DAYS = 30;

const state = {
  events: [],
  selectedId: null,
};

let idSeed = 1;
let currentBounds = null;

const dragState = {
  active: false,
  mode: null,
  eventId: null,
  startClientY: 0,
  baseStartMs: 0,
  baseEndMs: 0,
  lastStartMs: 0,
  lastEndMs: 0,
  originMs: 0,
};

function generateId() {
  idSeed += 1;
  return `ev-${Date.now()}-${idSeed}`;
}

function parseISO(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

function formatDayLabel(date) {
  const pad = (num) => String(num).padStart(2, "0");
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function formatRangeLabel(start, end) {
  if (!start || !end) return "";
  return `${formatDayLabel(start)} - ${formatDayLabel(end)}`;
}

function toLocalInput(date) {
  const pad = (num) => String(num).padStart(2, "0");
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    "T" +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}

function formatWithOffset(date) {
  const pad = (num) => String(num).padStart(2, "0");
  const tz = -date.getTimezoneOffset();
  const sign = tz >= 0 ? "+" : "-";
  const hours = pad(Math.floor(Math.abs(tz) / 60));
  const minutes = pad(Math.abs(tz) % 60);
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    "T" +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes()) +
    ":" +
    pad(date.getSeconds()) +
    sign +
    hours +
    ":" +
    minutes
  );
}

function ensureIds(events) {
  events.forEach((event) => {
    if (!event.__id) {
      event.__id = generateId();
    }
  });
}

function stripInternal(event) {
  const clone = { ...event };
  delete clone.__id;
  return clone;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ events: state.events }));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function getBounds(events) {
  if (!events.length) {
    const now = new Date();
    return {
      start: startOfDay(new Date(now.getTime() - MS_PER_DAY * PADDING_DAYS)),
      end: endOfDay(new Date(now.getTime() + MS_PER_DAY * (PADDING_DAYS + 7))),
    };
  }
  let min = null;
  let max = null;
  events.forEach((event) => {
    const start = parseISO(event.startDateTime);
    const end = parseISO(event.endDateTime);
    if (!start || !end) return;
    if (!min || start < min) min = start;
    if (!max || end > max) max = end;
  });
  if (!min || !max) {
    const now = new Date();
    return {
      start: startOfDay(new Date(now.getTime() - MS_PER_DAY * PADDING_DAYS)),
      end: endOfDay(new Date(now.getTime() + MS_PER_DAY * (PADDING_DAYS + 7))),
    };
  }
  return {
    start: startOfDay(new Date(min.getTime() - MS_PER_DAY * PADDING_DAYS)),
    end: endOfDay(new Date(max.getTime() + MS_PER_DAY * PADDING_DAYS)),
  };
}

function getDayHeight() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--le3-day-height");
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 64;
}

function renderRuler(bounds) {
  le3Ruler.innerHTML = "";
  const dayCount = Math.max(1, Math.ceil((bounds.end - bounds.start) / MS_PER_DAY));
  const todayStart = startOfDay(new Date()).getTime();
  for (let i = 0; i < dayCount; i += 1) {
    const day = new Date(bounds.start.getTime() + i * MS_PER_DAY);
    const cell = document.createElement("div");
    cell.className = "le3-ruler-day";
    if (day.getTime() === todayStart) {
      cell.classList.add("today");
    }
    cell.textContent = formatDayLabel(day);
    le3Ruler.appendChild(cell);
  }
}

function renderEvents(bounds) {
  le3TrackSurface.innerHTML = "";
  const dayHeight = getDayHeight();
  const dayCount = Math.max(1, Math.ceil((bounds.end - bounds.start) / MS_PER_DAY));
  le3TrackSurface.style.height = `${dayCount * dayHeight}px`;

  const todayStart = startOfDay(new Date()).getTime();
  if (todayStart >= bounds.start.getTime() && todayStart <= bounds.end.getTime()) {
    const line = document.createElement("div");
    line.className = "le3-today-line";
    const top = ((todayStart - bounds.start.getTime()) / MS_PER_DAY) * dayHeight;
    line.style.top = `${top}px`;
    le3TrackSurface.appendChild(line);
  }

  const sorted = [...state.events].sort((a, b) => {
    const startA = parseISO(a.startDateTime)?.getTime() ?? 0;
    const startB = parseISO(b.startDateTime)?.getTime() ?? 0;
    return startA - startB;
  });

  sorted.forEach((event) => {
    const start = parseISO(event.startDateTime);
    const end = parseISO(event.endDateTime);
    if (!start || !end) return;
    const top = ((start.getTime() - bounds.start.getTime()) / MS_PER_DAY) * dayHeight;
    const height = Math.max(24, ((end.getTime() - start.getTime()) / MS_PER_DAY) * dayHeight);

    const card = document.createElement("div");
    card.className = "le3-event";
    if (state.selectedId === event.__id) {
      card.classList.add("selected");
    }
    card.style.top = `${top-15}px`;
    card.style.height = `${height}px`;
    card.dataset.id = event.__id;

    const content = document.createElement("div");
    content.className = "le3-event-content";

    const title = document.createElement("div");
    title.className = "le3-event-title";
    title.textContent = event.titleText || event.tokenName || "Untitled";

    const meta = document.createElement("div");
    meta.className = "le3-event-meta";

    const range = document.createElement("div");
    range.className = "le3-event-range";
    range.textContent = formatRangeLabel(start, end);

    const token = document.createElement("div");
    token.textContent = event.tokenName || event.tokenID || "";

    meta.append(range, token);
    content.append(title, meta);
    card.append(content);

    if (event.tokenUrl) {
      const tokenImg = document.createElement("img");
      tokenImg.className = "le3-event-token";
      tokenImg.src = event.tokenUrl;
      tokenImg.alt = "token";
      tokenImg.loading = "lazy";
      tokenImg.decoding = "async";
      card.appendChild(tokenImg);
    }

    card.addEventListener("click", () => setSelected(event.__id));
    card.addEventListener("dblclick", (evt) => {
      evt.stopPropagation();
      showEventModal(event);
    });

    const resizeHandleTop = document.createElement("div");
    resizeHandleTop.className = "le3-event-resize top";
    resizeHandleTop.addEventListener("mousedown", (evt) => {
      evt.stopPropagation();
      beginDrag(event, "resize-start", evt);
    });
    card.appendChild(resizeHandleTop);

    const resizeHandleBottom = document.createElement("div");
    resizeHandleBottom.className = "le3-event-resize bottom";
    resizeHandleBottom.addEventListener("mousedown", (evt) => {
      evt.stopPropagation();
      beginDrag(event, "resize-end", evt);
    });
    card.appendChild(resizeHandleBottom);

    card.addEventListener("mousedown", (evt) => {
      if (evt.button !== 0) return;
      if (evt.target === resizeHandleTop || evt.target === resizeHandleBottom) return;
      beginDrag(event, "move", evt);
    });

    le3TrackSurface.appendChild(card);
  });
}

function updateDetailPanel() {
  const selected = state.events.find((event) => event.__id === state.selectedId);
  if (!selected) {
    le3DetailPanel.hidden = true;
    if (le3DetailImages) le3DetailImages.innerHTML = "";
    return;
  }
  le3DetailPanel.hidden = false;
  renderDetailImages(selected);
}

function collectImageEntries(event) {
  const entries = [];
  Object.entries(event).forEach(([key, value]) => {
    if (typeof value !== "string") return;
    if (!key.toLowerCase().includes("url")) return;
    entries.push({ key, url: value.trim() });
  });
  return entries;
}

function renderDetailImages(event) {
  if (!le3DetailImages) return;
  le3DetailImages.innerHTML = "";
  const entries = collectImageEntries(event);
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "le3-image-empty";
    empty.textContent = "No image URLs in this event.";
    le3DetailImages.appendChild(empty);
    return;
  }
  entries.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "le3-image-item";

    const meta = document.createElement("div");
    meta.className = "le3-image-meta";

    const label = document.createElement("div");
    label.className = "le3-image-label";
    label.textContent = entry.key;

    const input = document.createElement("textarea");
    input.className = "le3-image-input";
    input.value = entry.url || "";
    input.placeholder = "input URL";
    input.addEventListener("focus", () => {
      input.select();
    });

    const preview = document.createElement("div");
    preview.className = "le3-image-preview";

    const img = document.createElement("img");
    img.src = entry.url;
    img.alt = "event image";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => {
      item.classList.add("is-error");
    });
    img.addEventListener("load", () => {
      item.classList.remove("is-error");
    });

    input.addEventListener("change", () => {
      const nextUrl = input.value.trim();
      event[entry.key] = nextUrl;
      saveState();
      img.src = nextUrl || "";
      if (!nextUrl) {
        item.classList.add("is-empty");
      } else {
        item.classList.remove("is-empty");
      }
    });

    meta.append(label, input);
    preview.appendChild(img);
    item.append(meta, preview);
    le3DetailImages.appendChild(item);

    if (!entry.url) {
      item.classList.add("is-empty");
    }
  });
}

function setSelected(id) {
  state.selectedId = id;
  document.querySelectorAll(".le3-event.selected").forEach((el) => el.classList.remove("selected"));
  const target = document.querySelector(`.le3-event[data-id="${CSS.escape(id)}"]`);
  if (target) target.classList.add("selected");
  updateDetailPanel();
}

function clearSelection() {
  state.selectedId = null;
  document.querySelectorAll(".le3-event.selected").forEach((el) => el.classList.remove("selected"));
  updateDetailPanel();
}

function isEditableTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function hasOverlap(startMs, endMs, excludeId) {
  return state.events.some((event) => {
    if (event.__id === excludeId) return false;
    const otherStart = parseISO(event.startDateTime);
    const otherEnd = parseISO(event.endDateTime);
    if (!otherStart || !otherEnd) return false;
    return startMs < otherEnd.getTime() && endMs > otherStart.getTime();
  });
}

function snapToDay(ms, originMs) {
  const offset = ms - originMs;
  const snapped = Math.round(offset / MS_PER_DAY) * MS_PER_DAY;
  return originMs + snapped;
}

function updateEventTimes(event, startMs, endMs, shouldSave) {
  const startDate = new Date(startMs);
  const endDate = new Date(endMs);
  event.startDateTime = formatWithOffset(startDate);
  event.endDateTime = formatWithOffset(endDate);
  if (shouldSave) {
    saveState();
  }
}

function beginDrag(event, mode, mouseEvent) {
  if (!currentBounds) return;
  mouseEvent.preventDefault();
  const start = parseISO(event.startDateTime);
  const end = parseISO(event.endDateTime);
  if (!start || !end) return;
  setSelected(event.__id);
  dragState.active = true;
  dragState.mode = mode;
  dragState.eventId = event.__id;
  dragState.startClientY = mouseEvent.clientY;
  dragState.baseStartMs = start.getTime();
  dragState.baseEndMs = end.getTime();
  dragState.lastStartMs = dragState.baseStartMs;
  dragState.lastEndMs = dragState.baseEndMs;
  dragState.originMs = currentBounds.start.getTime();
  document.body.classList.add("no-select");
}

function applyDrag(clientY) {
  if (!dragState.active || !currentBounds) return;
  const target = state.events.find((item) => item.__id === dragState.eventId);
  if (!target) return;

  const dayHeight = getDayHeight();
  const deltaDays = (clientY - dragState.startClientY) / dayHeight;
  const deltaMs = deltaDays * MS_PER_DAY;

  let nextStartMs = dragState.baseStartMs;
  let nextEndMs = dragState.baseEndMs;

  if (dragState.mode === "move") {
    nextStartMs += deltaMs;
    nextEndMs += deltaMs;
  } else if (dragState.mode === "resize-end") {
    nextEndMs += deltaMs;
    if (nextEndMs <= nextStartMs + MS_PER_DAY) {
      nextEndMs = nextStartMs + MS_PER_DAY;
    }
  } else if (dragState.mode === "resize-start") {
    nextStartMs += deltaMs;
    if (nextStartMs >= nextEndMs - MS_PER_DAY) {
      nextStartMs = nextEndMs - MS_PER_DAY;
    }
  }

  nextStartMs = snapToDay(nextStartMs, dragState.originMs);
  nextEndMs = snapToDay(nextEndMs, dragState.originMs);
  if (nextEndMs <= nextStartMs) {
    nextEndMs = nextStartMs + MS_PER_DAY;
  }

  if (hasOverlap(nextStartMs, nextEndMs, target.__id)) {
    return;
  }

  dragState.lastStartMs = nextStartMs;
  dragState.lastEndMs = nextEndMs;
  updateEventTimes(target, nextStartMs, nextEndMs, false);
  renderAll();
}

function endDrag() {
  if (!dragState.active) return;
  const target = state.events.find((item) => item.__id === dragState.eventId);
  if (target) {
    updateEventTimes(target, dragState.lastStartMs, dragState.lastEndMs, true);
  }
  dragState.active = false;
  dragState.mode = null;
  dragState.eventId = null;
  document.body.classList.remove("no-select");
}

function createEmptyEvent() {
  return {
    startDateTime: "",
    endDateTime: "",
    minDurationHours: 0,
    titleUrl: "",
    titleText: "",
    tokenUrl: "",
    tokenID: "",
    keyVisualUrl: "",
    layoutIndex: 1,
    backgroundUrl: "",
    instructionBackgroundUrl: "",
    playButtonImageUrl: "",
    infoButtonImageUrl: "",
    closeButtonImageUrl: "",
    progressBarBackgroundUrl: "",
    progressBarFillUrl: "",
    descriptionColor: "#000000",
    descriptionInstructionColor: "#000000",
    playTextColor: "#FFFFFF",
    okInstructionTextColor: "#FFFFFF",
    playTextKey: "OK",
    tokenName: "",
    subInfoKey: "",
    instructionTitleKey: "",
    instructionSubInfoKey: "",
    durationHours: 0,
    tokenRangeMin: 0,
    tokenRangeMax: 0,
    milestones: [],
  };
}

function openModal(title, bodyHtml, buttons) {
  le3ModalTitle.textContent = title;
  le3ModalBody.innerHTML = bodyHtml;
  le3ModalFooter.innerHTML = "";
  buttons.forEach((btn) => le3ModalFooter.appendChild(btn));
  le3Modal.classList.add("is-open");
  le3Modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  le3Modal.classList.remove("is-open");
  le3Modal.setAttribute("aria-hidden", "true");
}

function createButton(label, className, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `le3-btn ${className || ""}`.trim();
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "le3-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 200);
  }, 2200);
}

function showEventModal(event) {
  const isNew = !event;
  const working = event ? { ...event } : { ...createEmptyEvent() };
  const start = parseISO(working.startDateTime) || new Date();
  const end = parseISO(working.endDateTime) || new Date(start.getTime() + MS_PER_DAY);

  const body = `
    <div class="le3-field">
      <label>Title (titleText)</label>
      <input type="text" id="le3EditTitle" />
    </div>
    <div class="le3-field">
      <label>Token Name</label>
      <input type="text" id="le3EditTokenName" />
    </div>
    <div class="le3-field">
      <label>Token ID</label>
      <input type="text" id="le3EditTokenId" />
    </div>
    <div class="le3-field">
      <label>Start</label>
      <input type="datetime-local" id="le3EditStart" lang="en-GB" />
    </div>
    <div class="le3-field">
      <label>End</label>
      <input type="datetime-local" id="le3EditEnd" lang="en-GB" />
    </div>
    <div class="le3-field">
      <label>Min Duration Hours (minDurationHours)</label>
      <input type="number" id="le3EditMinDuration" step="0.1" />
    </div>
    <div class="le3-field">
      <label>Layout Index (layoutIndex)</label>
      <input type="number" id="le3EditLayoutIndex" step="1" />
    </div>
    <div class="le3-field">
      <label>Token Range Min (tokenRangeMin)</label>
      <input type="number" id="le3EditTokenRangeMin" step="1" />
    </div>
    <div class="le3-field">
      <label>Token Range Max (tokenRangeMax)</label>
      <input type="number" id="le3EditTokenRangeMax" step="1" />
    </div>
    <div class="le3-field">
      <label>Play Text Key (playTextKey)</label>
      <input type="text" id="le3EditPlayTextKey" />
    </div>
    <div class="le3-field">
      <label>Sub Info Key (subInfoKey)</label>
      <input type="text" id="le3EditSubInfoKey" />
    </div>
    <div class="le3-field">
      <label>Instruction Title Key (instructionTitleKey)</label>
      <input type="text" id="le3EditInstructionTitleKey" />
    </div>
    <div class="le3-field">
      <label>Instruction Sub Info Key (instructionSubInfoKey)</label>
      <input type="text" id="le3EditInstructionSubInfoKey" />
    </div>
    <div class="le3-field">
      <label>Description Color (descriptionColor)</label>
      <div class="le3-color-row">
        <input type="color" id="le3EditDescriptionColor" />
        <input type="text" id="le3EditDescriptionColorHex" placeholder="#000000" />
        <span class="le3-color-preview" id="le3EditDescriptionColorPreview"></span>
      </div>
    </div>
    <div class="le3-field">
      <label>Description Instruction Color (descriptionInstructionColor)</label>
      <div class="le3-color-row">
        <input type="color" id="le3EditDescriptionInstructionColor" />
        <input type="text" id="le3EditDescriptionInstructionColorHex" placeholder="#000000" />
        <span class="le3-color-preview" id="le3EditDescriptionInstructionColorPreview"></span>
      </div>
    </div>
    <div class="le3-field">
      <label>Play Text Color (playTextColor)</label>
      <div class="le3-color-row">
        <input type="color" id="le3EditPlayTextColor" />
        <input type="text" id="le3EditPlayTextColorHex" placeholder="#FFFFFF" />
        <span class="le3-color-preview" id="le3EditPlayTextColorPreview"></span>
      </div>
    </div>
    <div class="le3-field">
      <label>OK Instruction Text Color (okInstructionTextColor)</label>
      <div class="le3-color-row">
        <input type="color" id="le3EditOkInstructionTextColor" />
        <input type="text" id="le3EditOkInstructionTextColorHex" placeholder="#FFFFFF" />
        <span class="le3-color-preview" id="le3EditOkInstructionTextColorPreview"></span>
      </div>
    </div>
  `;

  const saveBtn = createButton(isNew ? "Create" : "Save", "le3-btn-primary", () => {
    const titleValue = document.getElementById("le3EditTitle").value.trim();
    const tokenNameValue = document.getElementById("le3EditTokenName").value.trim();
    const tokenIdValue = document.getElementById("le3EditTokenId").value.trim();
    const startValue = document.getElementById("le3EditStart").value;
    const endValue = document.getElementById("le3EditEnd").value;
    const minDurationValue = parseFloat(document.getElementById("le3EditMinDuration").value);
    const layoutIndexValue = parseInt(document.getElementById("le3EditLayoutIndex").value, 10);
    const tokenRangeMinValue = parseInt(document.getElementById("le3EditTokenRangeMin").value, 10);
    const tokenRangeMaxValue = parseInt(document.getElementById("le3EditTokenRangeMax").value, 10);
    const playTextKeyValue = document.getElementById("le3EditPlayTextKey").value.trim();
    const subInfoKeyValue = document.getElementById("le3EditSubInfoKey").value.trim();
    const instructionTitleKeyValue = document.getElementById("le3EditInstructionTitleKey").value.trim();
    const instructionSubInfoKeyValue = document.getElementById("le3EditInstructionSubInfoKey").value.trim();
    const descriptionColorValue = document.getElementById("le3EditDescriptionColor").value;
    const descriptionInstructionColorValue =
      document.getElementById("le3EditDescriptionInstructionColor").value;
    const playTextColorValue = document.getElementById("le3EditPlayTextColor").value;
    const okInstructionTextColorValue = document.getElementById("le3EditOkInstructionTextColor").value;

    if (!startValue || !endValue) {
      showToast("Please select start/end time");
      return;
    }
    const nextStart = new Date(startValue);
    const nextEnd = new Date(endValue);
    if (!(nextStart < nextEnd)) {
      showToast("End must be after start");
      return;
    }
    if (hasOverlap(nextStart.getTime(), nextEnd.getTime(), working.__id)) {
      showToast("Event overlaps another event");
      return;
    }

    working.titleText = titleValue;
    working.tokenName = tokenNameValue;
    working.tokenID = tokenIdValue;
    working.startDateTime = formatWithOffset(nextStart);
    working.endDateTime = formatWithOffset(nextEnd);
    working.minDurationHours = Number.isFinite(minDurationValue) ? minDurationValue : 0;
    working.layoutIndex = Number.isFinite(layoutIndexValue) ? layoutIndexValue : 0;
    working.tokenRangeMin = Number.isFinite(tokenRangeMinValue) ? tokenRangeMinValue : 0;
    working.tokenRangeMax = Number.isFinite(tokenRangeMaxValue) ? tokenRangeMaxValue : 0;
    working.playTextKey = playTextKeyValue;
    working.subInfoKey = subInfoKeyValue;
    working.instructionTitleKey = instructionTitleKeyValue;
    working.instructionSubInfoKey = instructionSubInfoKeyValue;
    working.descriptionColor = descriptionColorValue || working.descriptionColor || "#000000";
    working.descriptionInstructionColor =
      descriptionInstructionColorValue || working.descriptionInstructionColor || "#000000";
    working.playTextColor = playTextColorValue || working.playTextColor || "#FFFFFF";
    working.okInstructionTextColor =
      okInstructionTextColorValue || working.okInstructionTextColor || "#FFFFFF";

    if (isNew) {
      working.__id = generateId();
      state.events.push(working);
      state.selectedId = working.__id;
    } else {
      const index = state.events.findIndex((item) => item.__id === working.__id);
      if (index !== -1) {
        state.events[index] = working;
      }
    }

    saveState();
    renderAll();
    closeModal();
    showToast(isNew ? "Event created" : "Event updated");
  });

  const cancelBtn = createButton("Cancel", "le3-btn-ghost", closeModal);
  openModal(isNew ? "New Event" : "Edit Event", body, [cancelBtn, saveBtn]);

  document.getElementById("le3EditTitle").value = working.titleText || "";
  document.getElementById("le3EditTokenName").value = working.tokenName || "";
  document.getElementById("le3EditTokenId").value = working.tokenID || "";
  document.getElementById("le3EditStart").value = toLocalInput(start);
  document.getElementById("le3EditEnd").value = toLocalInput(end);
  document.getElementById("le3EditMinDuration").value =
    Number.isFinite(working.minDurationHours) ? working.minDurationHours : 0;
  document.getElementById("le3EditLayoutIndex").value =
    Number.isFinite(working.layoutIndex) ? working.layoutIndex : 0;
  document.getElementById("le3EditTokenRangeMin").value =
    Number.isFinite(working.tokenRangeMin) ? working.tokenRangeMin : 0;
  document.getElementById("le3EditTokenRangeMax").value =
    Number.isFinite(working.tokenRangeMax) ? working.tokenRangeMax : 0;
  document.getElementById("le3EditPlayTextKey").value = working.playTextKey || "";
  document.getElementById("le3EditSubInfoKey").value = working.subInfoKey || "";
  document.getElementById("le3EditInstructionTitleKey").value = working.instructionTitleKey || "";
  document.getElementById("le3EditInstructionSubInfoKey").value =
    working.instructionSubInfoKey || "";
  const setColorField = (colorInputId, hexInputId, previewId, value, fallback) => {
    const normalized = value && /^#([0-9a-f]{6})$/i.test(value) ? value : fallback;
    const colorInput = document.getElementById(colorInputId);
    const hexInput = document.getElementById(hexInputId);
    const preview = document.getElementById(previewId);
    colorInput.value = normalized;
    hexInput.value = normalized;
    preview.style.background = normalized;

    colorInput.addEventListener("input", () => {
      hexInput.value = colorInput.value;
      preview.style.background = colorInput.value;
    });

    hexInput.addEventListener("input", () => {
      const raw = hexInput.value.trim();
      if (!/^#([0-9a-f]{6})$/i.test(raw)) return;
      colorInput.value = raw;
      preview.style.background = raw;
    });
  };

  setColorField(
    "le3EditDescriptionColor",
    "le3EditDescriptionColorHex",
    "le3EditDescriptionColorPreview",
    working.descriptionColor,
    "#000000"
  );
  setColorField(
    "le3EditDescriptionInstructionColor",
    "le3EditDescriptionInstructionColorHex",
    "le3EditDescriptionInstructionColorPreview",
    working.descriptionInstructionColor,
    "#000000"
  );
  setColorField(
    "le3EditPlayTextColor",
    "le3EditPlayTextColorHex",
    "le3EditPlayTextColorPreview",
    working.playTextColor,
    "#FFFFFF"
  );
  setColorField(
    "le3EditOkInstructionTextColor",
    "le3EditOkInstructionTextColorHex",
    "le3EditOkInstructionTextColorPreview",
    working.okInstructionTextColor,
    "#FFFFFF"
  );
}

function showExportModal() {
  const sortedEvents = [...state.events].sort((a, b) => {
    const startA = parseISO(a.startDateTime)?.getTime() ?? 0;
    const startB = parseISO(b.startDateTime)?.getTime() ?? 0;
    if (startA !== startB) return startA - startB;
    const endA = parseISO(a.endDateTime)?.getTime() ?? 0;
    const endB = parseISO(b.endDateTime)?.getTime() ?? 0;
    return endA - endB;
  });
  const payload = { events: sortedEvents.map(stripInternal) };
  const output = JSON.stringify(payload, null, 2);
  const body = `
    <div class="le3-field">
      <label>Config output</label>
      <textarea readonly id="le3ExportOutput">${output.replace(/</g, "&lt;")}</textarea>
    </div>
  `;
  const copyBtn = createButton("Copy", "le3-btn-primary", async () => {
    await navigator.clipboard.writeText(output);
    showToast("Copied to clipboard");
  });
  const closeBtn = createButton("Close", "le3-btn-ghost", closeModal);
  openModal("Export config", body, [closeBtn, copyBtn]);
}

function validateImport(payload) {
  if (!payload || !Array.isArray(payload.events)) {
    return "Invalid format. Expect { events: [] }.";
  }
  for (const event of payload.events) {
    if (!event.startDateTime || !event.endDateTime) {
      return "Each event needs startDateTime and endDateTime";
    }
    if (!parseISO(event.startDateTime) || !parseISO(event.endDateTime)) {
      return "Invalid date format in events";
    }
  }
  return null;
}

function showImportModal() {
  const body = `
    <div class="le3-field">
      <label>Config input</label>
      <textarea id="le3ImportInput" placeholder='{"events": []}'></textarea>
    </div>
  `;
  const importBtn = createButton("Import", "le3-btn-primary", () => {
    const raw = document.getElementById("le3ImportInput").value.trim();
    if (!raw) {
      showToast("Input is empty");
      return;
    }
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      showToast("Invalid JSON format");
      return;
    }
    const error = validateImport(payload);
    if (error) {
      showToast(error);
      return;
    }
    state.events = payload.events;
    ensureIds(state.events);
    state.selectedId = null;
    saveState();
    renderAll();
    closeModal();
    showToast("Import success");
  });
  const cancelBtn = createButton("Cancel", "le3-btn-ghost", closeModal);
  openModal("Import config", body, [cancelBtn, importBtn]);
}

function showClearModal() {
  const body = `
    <div class="le3-field">
      <label>This will remove all events from local storage.</label>
    </div>
  `;
  const clearBtn = createButton("Clear", "le3-btn-primary", () => {
    state.events = [];
    state.selectedId = null;
    localStorage.removeItem(STORAGE_KEY);
    renderAll();
    closeModal();
    showToast("Data cleared");
  });
  const cancelBtn = createButton("Cancel", "le3-btn-ghost", closeModal);
  openModal("Clear data", body, [cancelBtn, clearBtn]);
}

function deleteSelected() {
  if (!state.selectedId) return;
  const index = state.events.findIndex((event) => event.__id === state.selectedId);
  if (index === -1) return;
  state.events.splice(index, 1);
  state.selectedId = null;
  saveState();
  renderAll();
  showToast("Event deleted");
}

function renderAll() {
  const bounds = getBounds(state.events);
  currentBounds = bounds;
  renderRuler(bounds);
  renderEvents(bounds);
  updateDetailPanel();
}

function focusToday() {
  if (!currentBounds || !le3Scroll) return;
  const todayStart = startOfDay(new Date()).getTime();
  if (todayStart < currentBounds.start.getTime() || todayStart > currentBounds.end.getTime()) return;
  const dayHeight = getDayHeight();
  const top = ((todayStart - currentBounds.start.getTime()) / MS_PER_DAY) * dayHeight;
  const offset = Math.max(0, top - dayHeight * 2);
  le3Scroll.scrollTop = offset;
}

async function bootstrap() {
  const saved = loadState();
  if (saved && Array.isArray(saved.events)) {
    state.events = saved.events;
  } else {
    try {
      const response = await fetch("Config/sample-Le3.json", { cache: "no-store" });
      const data = await response.json();
      state.events = data.events || [];
    } catch (err) {
      state.events = [];
    }
  }
  ensureIds(state.events);
  renderAll();
  requestAnimationFrame(() => {
    focusToday();
  });
}

le3BtnNew.addEventListener("click", () => showEventModal(null));
le3BtnImport.addEventListener("click", showImportModal);
le3BtnExport.addEventListener("click", showExportModal);
le3BtnClear.addEventListener("click", showClearModal);
le3ModalClose.addEventListener("click", closeModal);
le3Modal.addEventListener("click", (event) => {
  if (event.target.dataset.close) closeModal();
});

le3TrackSurface.addEventListener("click", (event) => {
  if (event.target === le3TrackSurface) {
    clearSelection();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Delete" || event.key === "Backspace") {
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
    deleteSelected();
  }
});

window.addEventListener("mousemove", (event) => {
  if (!dragState.active) return;
  applyDrag(event.clientY);
});

window.addEventListener("mouseup", () => {
  if (!dragState.active) return;
  endDrag();
});

bootstrap();
