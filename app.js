const trackList = document.getElementById("trackList");
const tracksBody = document.getElementById("tracksBody");
const lanes = document.getElementById("lanes");
const timelineScroll = document.getElementById("timelineScroll");
const timelineSurface = document.getElementById("timelineSurface");
const timelineSpacer = document.getElementById("timelineSpacer");
const rulerDays = document.getElementById("rulerDays");
const rulerHours = document.getElementById("rulerHours");
const currentTimeLine = document.getElementById("currentTimeLine");
const timezoneSelect = document.getElementById("timezoneSelect");
const hoverLine = document.getElementById("hoverLine");
const hoverTime = document.getElementById("hoverTime");
const zoomIndicator = document.getElementById("zoomIndicator");
const zoomInput = document.getElementById("zoomInput");
const btnNewSeason = document.getElementById("btnNewSeason");
const btnImport = document.getElementById("btnImport");
const btnClear = document.getElementById("btnClear");
const btnExport = document.getElementById("btnExport");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalFooter = document.getElementById("modalFooter");
const modalClose = document.getElementById("modalClose");

const STORAGE_KEY = "gm_timeline_state_v1";
const TIMEZONE_KEY = "gm_timeline_timezone_v1";
const MS_PER_HOUR = 3600000;
const MS_PER_MINUTE = 60000;
const SNAP_MINUTES = 1;
const MIN_ZOOM = 0.016;
const BASE_ZOOM = 16;
const MAX_ZOOM = BASE_ZOOM * 10;
const HOURS_HIDE_ZOOM = 56;
const MAX_SURFACE_WIDTH = 2000000;
const DEFAULT_PADDING_HOURS = 8;
const TRACK_COLORS = [
  "#5B8FF9",
  "#5AD8A6",
  "#F6BD16",
  "#E8684A",
  "#6DC8EC",
  "#9270CA",
  "#FF9D4D",
  "#269A99",
  "#FF99C3",
  "#9DABF5",
  "#7EC8E3",
  "#B88CFF",
];

const state = {
  entries: [],
  trackOrder: [],
  hiddenTracks: [],
  zoom: 80,
  originMs: 0,
  surfaceWidth: 4000,
  viewX: 0,
  timeZoneOffsetMinutes: -new Date().getTimezoneOffset(),
  history: {
    undo: [],
    redo: [],
  },
};

const drag = {
  active: false,
  entryId: null,
  side: null,
  startX: 0,
  startMs: 0,
  endMs: 0,
  mode: null,
  element: null,
  trackName: null,
  prevEndMs: null,
  nextStartMs: null,
  rafId: null,
  lastClientX: 0,
  selectedIds: [],
  baseTimes: null,
};

let isSyncingScroll = false;
let trackDragName = null;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panScrollLeft = 0;
let panScrollTop = 0;
let selectedEntryId = null;
const selectedEntryIds = new Set();
const trackColorCache = new Map();
let nowOffsetMs = 0;

const marquee = {
  active: false,
  startClientX: 0,
  startClientY: 0,
  element: null,
};

function saveState() {
  const payload = {
    entries: state.entries,
    trackOrder: state.trackOrder,
    hiddenTracks: state.hiddenTracks,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn("Failed to parse storage", err);
    return null;
  }
}

function snapshotEntries() {
  return JSON.stringify(state.entries);
}

function pushHistory() {
  const snap = snapshotEntries();
  const last = state.history.undo[state.history.undo.length - 1];
  if (snap === last) return;
  state.history.undo.push(snap);
  state.history.redo = [];
}

function applySnapshot(snapshot) {
  state.entries = JSON.parse(snapshot);
  state.trackOrder = uniqueTracks(state.entries);
  state.hiddenTracks = [];
  selectedEntryId = null;
  selectedEntryIds.clear();
  saveState();
  renderAll();
}

function uniqueTracks(entries) {
  const set = new Set();
  entries.forEach((entry) => set.add(entry.eventName));
  return Array.from(set);
}

function getTrackEntries(trackName, excludeId) {
  const excludeSet = excludeId instanceof Set ? excludeId : excludeId ? new Set([excludeId]) : null;
  return state.entries
    .filter((entry) => entry.eventName === trackName && !(excludeSet && excludeSet.has(entry.calendarId)))
    .map((entry) => {
      const start = parseISO(entry.startDateTime);
      const end = parseISO(entry.endDateTime);
      if (!start || !end) return null;
      return {
        id: entry.calendarId,
        startMs: start.getTime(),
        endMs: end.getTime(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startMs - b.startMs);
}

function hasTrackOverlap(trackName, startMs, endMs, excludeId) {
  const others = getTrackEntries(trackName, excludeId);
  return others.some((other) => startMs < other.endMs && endMs > other.startMs);
}

function getTrackNeighbors(trackName, entryId, startMs, excludeIds) {
  const excludeSet = excludeIds instanceof Set ? excludeIds : entryId ? new Set([entryId]) : null;
  const others = getTrackEntries(trackName, excludeSet);
  let prevEnd = -Infinity;
  let nextStart = Infinity;
  for (const other of others) {
    if (other.startMs <= startMs) {
      if (other.endMs > prevEnd) prevEnd = other.endMs;
      continue;
    }
    if (other.startMs > startMs && other.startMs < nextStart) {
      nextStart = other.startMs;
    }
  }
  return { prevEndMs: prevEnd, nextStartMs: nextStart };
}

function parseISO(value) {
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
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

function getLocalOffsetMinutes() {
  return -new Date().getTimezoneOffset();
}

function getActiveOffsetMinutes() {
  return Number.isFinite(state.timeZoneOffsetMinutes) ? state.timeZoneOffsetMinutes : getLocalOffsetMinutes();
}

function toOffsetDate(date, offsetMinutes) {
  return new Date(date.getTime() + offsetMinutes * MS_PER_MINUTE);
}

function formatDayLabel(date) {
  const shifted = toOffsetDate(date, getActiveOffsetMinutes());
  const pad = (num) => String(num).padStart(2, "0");
  const day = pad(shifted.getUTCDate());
  const month = pad(shifted.getUTCMonth() + 1);
  const year = String(shifted.getUTCFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function formatMonthLabel(date) {
  const shifted = toOffsetDate(date, getActiveOffsetMinutes());
  return shifted.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatHourLabel(date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(toOffsetDate(date, getActiveOffsetMinutes()));
}

function formatHoverLabel(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(toOffsetDate(date, getActiveOffsetMinutes()));
}

function formatDateStamp(date) {
  const shifted = toOffsetDate(date, getActiveOffsetMinutes());
  const pad = (num) => String(num).padStart(2, "0");
  const year = String(shifted.getUTCFullYear()).slice(-2);
  const month = pad(shifted.getUTCMonth() + 1);
  const day = pad(shifted.getUTCDate());
  return `${year}/${month}/${day}`;
}

function formatDuration(start, end) {
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  const mins = minutes % 60;
  const hoursTotal = Math.floor(minutes / 60);
  const daysTotal = Math.floor(hoursTotal / 24);
  const months = Math.floor(daysTotal / 30);
  const days = daysTotal % 30;
  const hours = hoursTotal % 24;

  if (months > 0) {
    if (days > 0) return `${months}mo ${days}d`;
    return `${months}mo`;
  }
  if (daysTotal > 0) {
    if (hours > 0) return `${daysTotal}d ${hours}h`;
    return `${daysTotal}d`;
  }
  if (hoursTotal > 0) {
    if (mins > 0) return `${hoursTotal}h ${mins}m`;
    return `${hoursTotal}h`;
  }
  return `${minutes}m`;
}

function getNowMs() {
  return Date.now() + nowOffsetMs;
}

function getBounds(entries) {
  if (!entries.length) {
    const now = new Date(getNowMs());
    return { start: now, end: new Date(now.getTime() + MS_PER_HOUR * 6) };
  }
  let min = parseISO(entries[0].startDateTime);
  let max = parseISO(entries[0].endDateTime);
  entries.forEach((entry) => {
    const start = parseISO(entry.startDateTime);
    const end = parseISO(entry.endDateTime);
    if (start && start < min) min = start;
    if (end && end > max) max = end;
  });
  const now = new Date(getNowMs());
  if (now < min) min = now;
  if (now > max) max = now;
  return { start: min, end: max };
}

function recalcSurface() {
  const bounds = getBounds(state.entries);
  const paddedStart = new Date(bounds.start.getTime() - DEFAULT_PADDING_HOURS * MS_PER_HOUR);
  const paddedEnd = new Date(bounds.end.getTime() + DEFAULT_PADDING_HOURS * MS_PER_HOUR);
  state.originMs = paddedStart.getTime();
  const totalHours = Math.max(8, (paddedEnd - paddedStart) / MS_PER_HOUR);
  const minWidth = Math.max(2000, timelineScroll.clientWidth + 800);
  state.surfaceWidth = Math.min(MAX_SURFACE_WIDTH, Math.max(minWidth, totalHours * state.zoom));
  timelineSurface.style.width = `${state.surfaceWidth}px`;
  timelineSurface.style.backgroundSize = `${state.zoom}px 100%`;
}

function timeToX(ms) {
  return ((ms - state.originMs) / MS_PER_HOUR) * state.zoom;
}

function xToTime(x) {
  return state.originMs + (x / state.zoom) * MS_PER_HOUR;
}

function getTrackColor(trackName) {
  if (trackColorCache.has(trackName)) return trackColorCache.get(trackName);
  let hash = 0;
  for (let i = 0; i < trackName.length; i += 1) {
    hash = (hash * 31 + trackName.charCodeAt(i)) >>> 0;
  }
  const color = TRACK_COLORS[hash % TRACK_COLORS.length];
  trackColorCache.set(trackName, color);
  return color;
}

function clampViewX(value) {
  const maxLeft = Math.max(0, state.surfaceWidth - timelineScroll.clientWidth);
  return Math.min(Math.max(0, value), maxLeft);
}

function applyViewX() {
  state.viewX = clampViewX(state.viewX);
  timelineSurface.style.left = `${-state.viewX}px`;
  updateNowLine(false);
  updateSeasonFloatLabels();
  updateRulerSticky();
}

function applySelectionClass(entryId) {
  document.querySelectorAll(".season.selected").forEach((season) => season.classList.remove("selected"));
  if (entryId) {
    selectedEntryIds.clear();
    selectedEntryIds.add(entryId);
  }
  selectedEntryIds.forEach((id) => {
    const target = lanes.querySelector(`.season[data-id="${CSS.escape(id)}"]`);
    if (target) target.classList.add("selected");
  });
}

function setSelectedEntry(entryId, shouldRender = true) {
  if (selectedEntryId === entryId) return;
  selectedEntryId = entryId;
  if (shouldRender) {
    renderLanes();
    return;
  }
  applySelectionClass(entryId);
}

function setSelection(ids, shouldRender = false) {
  selectedEntryIds.clear();
  ids.forEach((id) => {
    if (id) selectedEntryIds.add(id);
  });
  selectedEntryId = ids.length === 1 ? ids[0] : null;
  if (shouldRender) {
    renderLanes();
    return;
  }
  applySelectionClass(null);
}

function toggleSelection(id) {
  if (!id) return;
  if (selectedEntryIds.has(id)) {
    selectedEntryIds.delete(id);
  } else {
    selectedEntryIds.add(id);
  }
  selectedEntryId = selectedEntryIds.size === 1 ? Array.from(selectedEntryIds)[0] : null;
  applySelectionClass(null);
}

function clearSelection(shouldRender = false) {
  selectedEntryIds.clear();
  selectedEntryId = null;
  if (shouldRender) {
    renderLanes();
    return;
  }
  applySelectionClass(null);
}

function isEditableTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function getNextCalendarId() {
  return String(Math.max(0, ...state.entries.map((e) => Number(e.calendarId) || 0)) + 1);
}

function deleteSelectedSeason() {
  const idsToDelete = selectedEntryIds.size ? Array.from(selectedEntryIds) : selectedEntryId ? [selectedEntryId] : [];
  if (!idsToDelete.length) return;
  const removedTracks = new Set();
  idsToDelete.forEach((id) => {
    const index = state.entries.findIndex((entry) => entry.calendarId === id);
    if (index === -1) return;
    const removed = state.entries[index];
    removedTracks.add(removed.eventName);
    state.entries.splice(index, 1);
  });
  selectedEntryId = null;
  selectedEntryIds.clear();
  removedTracks.forEach((track) => {
    const stillHasTrack = state.entries.some((entry) => entry.eventName === track);
    if (!stillHasTrack) {
      state.trackOrder = state.trackOrder.filter((name) => name !== track);
      state.hiddenTracks = state.hiddenTracks.filter((name) => name !== track);
    }
  });
  saveState();
  pushHistory();
  renderAll();
}

function duplicateSelectedSeason() {
  if (!selectedEntryId) return;
  const entry = state.entries.find((item) => item.calendarId === selectedEntryId);
  if (!entry) return;
  const start = parseISO(entry.startDateTime);
  const end = parseISO(entry.endDateTime);
  if (!start || !end) return;
  const durationMs = end.getTime() - start.getTime();
  const newStart = new Date(end.getTime());
  const newEnd = new Date(end.getTime() + durationMs);
  const nextId = getNextCalendarId();
  const clone = {
    ...entry,
    calendarId: nextId,
    startDateTime: formatWithOffset(newStart),
    endDateTime: formatWithOffset(newEnd),
  };
  state.entries.push(clone);
  if (!state.trackOrder.includes(clone.eventName)) {
    state.trackOrder.push(clone.eventName);
  }
  selectedEntryId = nextId;
  saveState();
  pushHistory();
  renderAll();
}

function deleteTrack(trackName) {
  if (!trackName) return;
  state.entries = state.entries.filter((entry) => entry.eventName !== trackName);
  state.trackOrder = state.trackOrder.filter((name) => name !== trackName);
  state.hiddenTracks = state.hiddenTracks.filter((name) => name !== trackName);
  if (selectedEntryId && !state.entries.some((entry) => entry.calendarId === selectedEntryId)) {
    selectedEntryId = null;
  }
  if (selectedEntryIds.size) {
    let removed = false;
    Array.from(selectedEntryIds).forEach((id) => {
      if (!state.entries.some((entry) => entry.calendarId === id)) {
        selectedEntryIds.delete(id);
        removed = true;
      }
    });
    if (removed && selectedEntryIds.size === 0) {
      selectedEntryId = null;
    }
  }
  saveState();
  pushHistory();
  renderAll();
}

function toggleTrackVisibility(trackName) {
  if (!trackName) return;
  if (state.hiddenTracks.includes(trackName)) {
    state.hiddenTracks = state.hiddenTracks.filter((name) => name !== trackName);
  } else {
    state.hiddenTracks = [...state.hiddenTracks, trackName];
    if (selectedEntryId) {
      const selected = state.entries.find((entry) => entry.calendarId === selectedEntryId);
      if (selected && selected.eventName === trackName) {
        selectedEntryId = null;
      }
    }
  }
  saveState();
  renderAll();
}


function renderTracks() {
  trackList.innerHTML = "";
  state.trackOrder.forEach((trackName) => {
    const row = document.createElement("div");
    row.className = "track-row";
    if (state.hiddenTracks.includes(trackName)) {
      row.classList.add("is-hidden");
    }
    row.draggable = true;
    row.dataset.track = trackName;

    const visibilityBtn = document.createElement("button");
    visibilityBtn.className = "track-visibility";
    visibilityBtn.type = "button";
    visibilityBtn.title = state.hiddenTracks.includes(trackName) ? "Show track" : "Hide track";
    visibilityBtn.innerHTML = state.hiddenTracks.includes(trackName)
      ? "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 6c5 0 9.27 3.11 11 6-1.06 1.77-2.73 3.55-4.86 4.79l1.65 1.65-1.41 1.41-18-18 1.41-1.41 3.12 3.12C6.7 6.97 9.3 6 12 6zm0 4a2 2 0 0 1 2 2c0 .2-.03.39-.08.56l-2.48-2.48c.17-.05.36-.08.56-.08zm-2.48 2.48A2 2 0 0 0 12 14c.2 0 .39-.03.56-.08l-2.48-2.48z\"/></svg>"
      : "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 6c5 0 9.27 3.11 11 6-1.73 2.89-6 6-11 6S2.73 14.89 1 12c1.73-2.89 6-6 11-6zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z\"/></svg>";
    visibilityBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleTrackVisibility(trackName);
    });

    const chip = document.createElement("div");
    chip.className = "track-chip";
    chip.textContent = trackName.slice(0, 3).toUpperCase();
    chip.style.background = getTrackColor(trackName);
    chip.title = "Show seasons";
    chip.addEventListener("click", (event) => {
      event.stopPropagation();
      showTrackSeasonsModal(trackName);
    });

    const info = document.createElement("div");
    info.className = "track-info";

    const name = document.createElement("div");
    name.className = "track-name";
    name.textContent = trackName;
    name.title = "Click to rename";
    name.addEventListener("click", (event) => {
      event.stopPropagation();
      beginTrackRename(row, name, trackName);
    });

    const meta = document.createElement("div");
    meta.className = "track-meta";
    const count = state.entries.filter((entry) => entry.eventName === trackName).length;
    meta.textContent = `${count} seasons`;

    info.append(name, meta);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "track-delete";
    deleteBtn.type = "button";
    deleteBtn.title = "Delete track";
    deleteBtn.innerHTML = "&times;";
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteTrack(trackName);
    });

    row.append(visibilityBtn, chip, info, deleteBtn);
    row.addEventListener("dragstart", onTrackDragStart);
    row.addEventListener("dragover", onTrackDragOver);
    row.addEventListener("dragleave", onTrackDragLeave);
    row.addEventListener("drop", onTrackDrop);

    trackList.appendChild(row);
  });
}

function renderLanes() {
  lanes.innerHTML = "";
  const nowMs = getNowMs();
  const viewLeft = state.viewX;
  const viewRight = state.viewX + timelineScroll.clientWidth;
  state.trackOrder.forEach((trackName) => {
    const lane = document.createElement("div");
    lane.className = "lane";
    if (state.hiddenTracks.includes(trackName)) {
      lane.classList.add("hidden");
    }
    lane.dataset.track = trackName;

    state.entries
      .filter((entry) => entry.eventName === trackName)
      .forEach((entry) => {
        const start = parseISO(entry.startDateTime);
        const end = parseISO(entry.endDateTime);
        if (!start || !end) return;
        const left = timeToX(start.getTime());
        const width = Math.max(10, timeToX(end.getTime()) - left);
        const trackColor = getTrackColor(trackName);

        const season = document.createElement("div");
        season.className = "season";
        const startMs = start.getTime();
        const endMs = end.getTime();
        if (endMs < nowMs) {
          season.classList.add("past");
        } else if (startMs > nowMs) {
          season.classList.add("future");
        } else {
          season.classList.add("current");
        }
        if (selectedEntryId === entry.calendarId) {
          season.classList.add("selected");
        }
        if (selectedEntryIds.has(entry.calendarId)) {
          season.classList.add("selected");
        }
        season.style.left = `${left}px`;
        season.style.width = `${width}px`;
        season.dataset.id = entry.calendarId;
        season.style.setProperty("--track-color", trackColor);
        season.dataset.left = String(left);
        season.dataset.width = String(width);

        const content = document.createElement("div");
        content.className = "season-content";

        const title = document.createElement("div");
        title.className = "season-title";
        title.textContent = entry.calendarId;

        const time = document.createElement("div");
        time.className = "season-time";
        time.textContent = `${formatHourLabel(start)} - ${formatHourLabel(end)}`;

        const duration = document.createElement("div");
        duration.className = "season-duration";
        duration.textContent = formatDuration(start, end);

        content.append(title, time);

        const floatLabel = document.createElement("div");
        floatLabel.className = "season-float";
        floatLabel.innerHTML = `
          <div class="season-float-line">[${escapeHtml(entry.calendarId)}]</div>
          <div class="season-float-line">${escapeHtml(formatHourLabel(start))} ${escapeHtml(formatDateStamp(start))}</div>
          <div class="season-float-line">${escapeHtml(formatHourLabel(end))} ${escapeHtml(formatDateStamp(end))}</div>
        `;
        const isVisible = left + width >= viewLeft && left <= viewRight;
        const isOverflowLeft = left < viewLeft;
        const isHiddenTrack = state.hiddenTracks.includes(trackName);
        if (isVisible && isOverflowLeft && !isHiddenTrack) {
          const offsetLeft = Math.max(8, viewLeft - left + 8);
          const maxOffset = Math.max(8, width - 8);
          floatLabel.style.left = `${Math.min(offsetLeft, maxOffset)}px`;
          floatLabel.style.maxWidth = `${Math.max(40, width - 16)}px`;
        } else {
          floatLabel.style.display = "none";
        }

        const handleLeft = document.createElement("div");
        handleLeft.className = "season-handle left";
        handleLeft.dataset.side = "start";
        handleLeft.dataset.id = entry.calendarId;

        const handleRight = document.createElement("div");
        handleRight.className = "season-handle right";
        handleRight.dataset.side = "end";
        handleRight.dataset.id = entry.calendarId;

        season.append(floatLabel, content, duration, handleLeft, handleRight);
        lane.appendChild(season);
      });

    lanes.appendChild(lane);
  });
}

function updateSeasonFloatLabels() {
  const viewLeft = state.viewX;
  const viewRight = state.viewX + timelineScroll.clientWidth;
  document.querySelectorAll(".season").forEach((season) => {
    const label = season.querySelector(".season-float");
    if (!label) return;
    if (season.closest(".lane.hidden")) {
      label.style.display = "none";
      return;
    }
    const left = Number(season.dataset.left || 0);
    const width = Number(season.dataset.width || 0);
    const isVisible = left + width >= viewLeft && left <= viewRight;
    const isOverflowLeft = left < viewLeft;
    if (!isVisible || !isOverflowLeft) {
      label.style.display = "none";
      return;
    }
    label.style.display = "block";
    const offsetLeft = Math.max(8, viewLeft - left + 8);
    const maxOffset = Math.max(8, width - 8);
    label.style.left = `${Math.min(offsetLeft, maxOffset)}px`;
    label.style.maxWidth = `${Math.max(40, width - 16)}px`;
  });
}

function updateSeasonElement(entry, seasonEl) {
  if (!entry || !seasonEl) return;
  const start = parseISO(entry.startDateTime);
  const end = parseISO(entry.endDateTime);
  if (!start || !end) return;
  const left = timeToX(start.getTime());
  const width = Math.max(10, timeToX(end.getTime()) - left);
  seasonEl.style.left = `${left}px`;
  seasonEl.style.width = `${width}px`;
  seasonEl.dataset.left = String(left);
  seasonEl.dataset.width = String(width);

  const nowMs = getNowMs();
  seasonEl.classList.remove("past", "current", "future");
  if (end.getTime() < nowMs) {
    seasonEl.classList.add("past");
  } else if (start.getTime() > nowMs) {
    seasonEl.classList.add("future");
  } else {
    seasonEl.classList.add("current");
  }

  const timeEl = seasonEl.querySelector(".season-time");
  if (timeEl) {
    timeEl.textContent = `${formatHourLabel(start)} - ${formatHourLabel(end)}`;
  }
  const durationEl = seasonEl.querySelector(".season-duration");
  if (durationEl) {
    durationEl.textContent = formatDuration(start, end);
  }
  const floatLabel = seasonEl.querySelector(".season-float");
  if (floatLabel) {
    floatLabel.innerHTML = `
      <div class="season-float-line">[${escapeHtml(entry.calendarId)}]</div>
      <div class="season-float-line">${escapeHtml(formatHourLabel(start))} ${escapeHtml(formatDateStamp(start))}</div>
      <div class="season-float-line">${escapeHtml(formatHourLabel(end))} ${escapeHtml(formatDateStamp(end))}</div>
    `;
  }
}

function updateAllSeasonsLayout() {
  state.entries.forEach((entry) => {
    const seasonEl = lanes.querySelector(`.season[data-id="${CSS.escape(entry.calendarId)}"]`);
    if (!seasonEl) return;
    updateSeasonElement(entry, seasonEl);
  });
}

function pickStep(pxPerUnit, minSpacing, steps) {
  return steps.find((step) => step * pxPerUnit >= minSpacing) || steps[steps.length - 1];
}

function renderRuler() {
  rulerDays.innerHTML = "";
  rulerHours.innerHTML = "";
  timelineSurface.querySelectorAll(".day-divider").forEach((divider) => divider.remove());
  const zoomPercent = (state.zoom / BASE_ZOOM) * 100;
  const showHours = zoomPercent >= 40;
  const showDayDividers = zoomPercent >= 100;

  const startTime = state.originMs;
  const endTime = xToTime(state.surfaceWidth);

  const startDate = new Date(startTime);
  startDate.setMinutes(0, 0, 0);
  const endDate = new Date(endTime);

  const pxPerHour = state.zoom;
  const pxPerDay = pxPerHour * 24;
  const minDayLabelSpacing = 90;
  const minHourLabelSpacing = 70;

  const useMonths = pxPerDay < minDayLabelSpacing * 0.75;
  if (useMonths) {
    const monthCursor = new Date(startDate);
    monthCursor.setDate(1);
    monthCursor.setHours(0, 0, 0, 0);

    const monthSteps = [1, 2, 3, 4, 6, 12];
    const stepMonths = pickStep(pxPerDay * 30, minDayLabelSpacing, monthSteps);

    while (monthCursor <= endDate) {
      if (monthCursor >= startDate) {
        const x = timeToX(monthCursor.getTime());
        const tick = document.createElement("div");
        tick.className = "ruler-tick";
        tick.style.left = `${x}px`;
        tick.dataset.left = String(x);
        tick.dataset.time = String(monthCursor.getTime());
        tick.innerHTML = `<strong>${formatMonthLabel(monthCursor)}</strong>`;
        rulerDays.appendChild(tick);
      }
      monthCursor.setMonth(monthCursor.getMonth() + stepMonths);
    }
  } else {
    const daySteps = [1, 2, 3, 5, 7, 10, 14, 21, 28];
    const stepDays = pickStep(pxPerDay, minDayLabelSpacing, daySteps);
    const dayCursor = new Date(startDate);
    dayCursor.setHours(0, 0, 0, 0);

    while (dayCursor <= endDate) {
      const x = timeToX(dayCursor.getTime());
      const tick = document.createElement("div");
      tick.className = "ruler-tick";
      tick.style.left = `${x}px`;
      tick.dataset.left = String(x);
      tick.dataset.time = String(dayCursor.getTime());
      tick.innerHTML = `<strong>${formatDayLabel(dayCursor)}</strong>`;
      rulerDays.appendChild(tick);

      if (showDayDividers) {
        const divider = document.createElement("div");
        divider.className = "day-divider";
        divider.style.left = `${x}px`;
        divider.dataset.time = String(dayCursor.getTime());
        timelineSurface.appendChild(divider);
      }
      dayCursor.setDate(dayCursor.getDate() + stepDays);
    }
  }

  if (showHours) {
    const hourSteps = [1, 2, 3, 4, 6, 8, 12, 24, 48, 72, 168];
    const hourStep = pickStep(pxPerHour, minHourLabelSpacing, hourSteps);

    const hourCursor = new Date(startDate);
    const alignOffset = hourCursor.getHours() % hourStep;
    if (alignOffset !== 0) {
      hourCursor.setHours(hourCursor.getHours() - alignOffset);
    }
    hourCursor.setMinutes(0, 0, 0);
    while (hourCursor <= endDate) {
      const x = timeToX(hourCursor.getTime());
      const tick = document.createElement("div");
      tick.className = "ruler-tick";
      tick.style.left = `${x}px`;
      tick.dataset.time = String(hourCursor.getTime());
      tick.textContent = formatHourLabel(hourCursor);
      rulerHours.appendChild(tick);
      hourCursor.setHours(hourCursor.getHours() + hourStep);
    }
  }

  updateRulerSticky();
}

function updateRulerSticky() {
  const viewLeft = state.viewX;
  rulerDays.querySelectorAll(".ruler-tick").forEach((tick) => {
    const baseLeft = Number(tick.dataset.left || 0);
    if (baseLeft < viewLeft) {
      tick.classList.add("stuck");
      tick.style.left = `${viewLeft}px`;
    } else {
      tick.classList.remove("stuck");
      tick.style.left = `${baseLeft}px`;
    }
  });
}

function renderAll() {
  const prevTop = timelineScroll.scrollTop;
  recalcSurface();
  renderTracks();
  renderLanes();
  renderRuler();
  applyViewX();
  updateZoomIndicator();
  syncHeights();
  const maxTop = Math.max(0, lanes.offsetHeight - timelineScroll.clientHeight);
  timelineScroll.scrollTop = Math.min(prevTop, maxTop);
}

function ensureMarquee() {
  if (marquee.element) return;
  marquee.element = document.createElement("div");
  marquee.element.className = "marquee-select";
  timelineSurface.appendChild(marquee.element);
}

function startMarqueeSelection(event) {
  ensureMarquee();
  marquee.active = true;
  marquee.startClientX = event.clientX;
  marquee.startClientY = event.clientY;
  marquee.element.style.display = "block";
  updateMarqueeRect(event.clientX, event.clientY);
}

function updateMarqueeRect(clientX, clientY) {
  const rect = timelineScroll.getBoundingClientRect();
  const startX = marquee.startClientX - rect.left + state.viewX;
  const startY = marquee.startClientY - rect.top + timelineScroll.scrollTop;
  const currentX = clientX - rect.left + state.viewX;
  const currentY = clientY - rect.top + timelineScroll.scrollTop;
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  marquee.element.style.left = `${left}px`;
  marquee.element.style.top = `${top}px`;
  marquee.element.style.width = `${width}px`;
  marquee.element.style.height = `${height}px`;
}

function finishMarqueeSelection(event) {
  if (!marquee.active) return;
  marquee.active = false;
  if (marquee.element) {
    marquee.element.style.display = "none";
  }
  const rect = timelineScroll.getBoundingClientRect();
  const minX = Math.min(marquee.startClientX, event.clientX);
  const maxX = Math.max(marquee.startClientX, event.clientX);
  const minY = Math.min(marquee.startClientY, event.clientY);
  const maxY = Math.max(marquee.startClientY, event.clientY);
  const addToSelection = event.ctrlKey || event.metaKey;
  const width = maxX - minX;
  const height = maxY - minY;
  if (width < 3 && height < 3) {
    if (!addToSelection) {
      clearSelection(false);
    }
    return;
  }

  const hits = [];
  document.querySelectorAll(".season").forEach((season) => {
    if (season.closest(".lane.hidden")) return;
    const srect = season.getBoundingClientRect();
    const overlaps =
      srect.right >= minX &&
      srect.left <= maxX &&
      srect.bottom >= minY &&
      srect.top <= maxY;
    if (overlaps) hits.push(season.dataset.id);
  });

  if (addToSelection) {
    hits.forEach((id) => selectedEntryIds.add(id));
    selectedEntryId = selectedEntryIds.size === 1 ? Array.from(selectedEntryIds)[0] : null;
    applySelectionClass(null);
  } else {
    setSelection(hits, false);
  }
}

function focusOnStart() {
  const bounds = getBounds(state.entries);
  const target = timeToX(bounds.start.getTime()) - state.zoom;
  state.viewX = clampViewX(target);
  applyViewX();
}

function focusOnNow() {
  const x = timeToX(getNowMs());
  const target = x - timelineScroll.clientWidth / 2;
  state.viewX = clampViewX(target);
  applyViewX();
}

function updateNowLine(shouldScroll) {
  if (!currentTimeLine) return;
  const x = timeToX(getNowMs());
  currentTimeLine.style.left = `${x}px`;
  if (shouldScroll) {
    focusOnNow();
  }
}

function updateZoomIndicator() {
  if (!zoomIndicator) return;
  const percent = Math.round((state.zoom / BASE_ZOOM) * 100);
  zoomIndicator.textContent = `Zoom ${percent}%`;
  if (zoomInput && document.activeElement !== zoomInput) {
    zoomInput.value = String(percent);
  }
}

function updateZoomLayout() {
  recalcSurface();
  updateAllSeasonsLayout();
  renderRuler();
  applyViewX();
  updateZoomIndicator();
  syncHeights();
}

function updateHoverLine(clientX, clientY) {
  if (!hoverLine || !hoverTime) return;
  const rect = timelineScroll.getBoundingClientRect();
  const viewportX = clientX - rect.left;
  const viewportY = clientY - rect.top;
  const worldX = state.viewX + viewportX;
  hoverLine.style.left = `${worldX}px`;
  hoverLine.style.opacity = "1";
  const time = new Date(xToTime(worldX));
  hoverTime.textContent = formatHoverLabel(time);
  const targetY = viewportY + 20;
  const maxY = Math.max(0, timelineScroll.clientHeight - 28);
  const clampedY = Math.min(Math.max(8, targetY), maxY);
  hoverTime.style.top = `${clampedY}px`;
}

function bindHoverLine() {
  if (!hoverLine || !hoverTime) return;
  timelineScroll.addEventListener("mousemove", (event) => {
    updateHoverLine(event.clientX, event.clientY);
  });
  timelineScroll.addEventListener("mouseleave", () => {
    hoverLine.style.opacity = "0";
  });
}

function bindSeasonSelection() {
  lanes.addEventListener("pointerdown", (event) => {
    const season = event.target.closest(".season");
    if (!season) {
      return;
    }
    if (season.closest(".lane.hidden")) return;
  });

  lanes.addEventListener("dblclick", (event) => {
    const season = event.target.closest(".season");
    if (!season) return;
    if (season.closest(".lane.hidden")) return;
    const entry = state.entries.find((item) => item.calendarId === season.dataset.id);
    if (!entry) return;
    setSelectedEntry(entry.calendarId);
    showSeasonInfoModal(entry);
  });
}

function syncHeights() {
  const rowHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--row-height"));
  const rulerHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ruler-height"));
  const totalHeight = state.trackOrder.length * rowHeight;
  const surfaceHeight = totalHeight + rulerHeight;
  lanes.style.minHeight = `${totalHeight}px`;
  trackList.style.minHeight = `${totalHeight}px`;
  timelineSurface.style.height = `${surfaceHeight}px`;
  if (timelineSpacer) {
    timelineSpacer.style.height = `${surfaceHeight}px`;
  }
}

function onTrackDragStart(event) {
  const track = event.currentTarget.dataset.track;
  trackDragName = track;
  event.dataTransfer.effectAllowed = "move";
}

function onTrackDragOver(event) {
  event.preventDefault();
  event.currentTarget.classList.add("drag-over");
}

function onTrackDragLeave(event) {
  event.currentTarget.classList.remove("drag-over");
}

function onTrackDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove("drag-over");
  const targetTrack = event.currentTarget.dataset.track;
  if (!trackDragName || trackDragName === targetTrack) return;
  const fromIndex = state.trackOrder.indexOf(trackDragName);
  const toIndex = state.trackOrder.indexOf(targetTrack);
  if (fromIndex === -1 || toIndex === -1) return;
  state.trackOrder.splice(fromIndex, 1);
  state.trackOrder.splice(toIndex, 0, trackDragName);
  saveState();
  renderAll();
}

function onWheelTimeline(event) {
  if (event.altKey) {
    event.preventDefault();
    const rect = timelineScroll.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const cursorTime = xToTime(state.viewX + offsetX);
    const zoomFactor = Math.exp(-event.deltaY * 0.0025);
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom * zoomFactor));
    if (nextZoom !== state.zoom) {
      state.zoom = nextZoom;
      recalcSurface();
      state.viewX = clampViewX(timeToX(cursorTime) - offsetX);
      updateAllSeasonsLayout();
      renderRuler();
      applyViewX();
      updateZoomIndicator();
      syncHeights();
      saveState();
    }
    return;
  }

  if (event.shiftKey) {
    event.preventDefault();
    state.viewX = clampViewX(state.viewX + event.deltaY);
    applyViewX();
    return;
  }

  if (Math.abs(event.deltaX) > 0) {
    event.preventDefault();
    state.viewX = clampViewX(state.viewX + event.deltaX);
    applyViewX();
    return;
  }
}

function bindPan() {
  timelineScroll.addEventListener("pointerdown", (event) => {
    if (event.button === 2) {
      if (event.target.closest(".season") || event.target.closest(".season-handle")) return;
      event.preventDefault();
      startMarqueeSelection(event);
      timelineScroll.setPointerCapture(event.pointerId);
      document.body.classList.add("no-select");
      return;
    }
    if (event.button !== 0) return;
    if (event.target.closest(".season") || event.target.closest(".season-handle")) return;
    isPanning = true;
    panStartX = event.clientX;
    panStartY = event.clientY;
    panScrollLeft = state.viewX;
    panScrollTop = timelineScroll.scrollTop;
    timelineScroll.setPointerCapture(event.pointerId);
    timelineScroll.style.cursor = "grabbing";
    document.body.classList.add("no-select");
  });

  timelineScroll.addEventListener("pointermove", (event) => {
    if (marquee.active) return;
    if (!isPanning) return;
    const dx = event.clientX - panStartX;
    const dy = event.clientY - panStartY;
    state.viewX = clampViewX(panScrollLeft - dx);
    applyViewX();
    timelineScroll.scrollTop = panScrollTop - dy;
  });

  timelineScroll.addEventListener("pointerup", (event) => {
    if (marquee.active) {
      finishMarqueeSelection(event);
      timelineScroll.releasePointerCapture(event.pointerId);
      document.body.classList.remove("no-select");
      return;
    }
    if (!isPanning) return;
    isPanning = false;
    timelineScroll.releasePointerCapture(event.pointerId);
    timelineScroll.style.cursor = "default";
    document.body.classList.remove("no-select");
  });

  timelineScroll.addEventListener("contextmenu", (event) => {
    if (event.target.closest(".timeline-scroll")) {
      event.preventDefault();
    }
  });
}

function bindResizeHandles() {
  lanes.addEventListener("pointerdown", (event) => {
    if (event.button === 2) return;
    const season = event.target.closest(".season");
    const handle = event.target.closest(".season-handle");
    if (!handle && !season) return;
    if (event.target.closest(".lane.hidden")) return;
    const isToggle = event.ctrlKey || event.metaKey;
    if (handle) {
      event.preventDefault();
      const entryId = handle.dataset.id;
      const side = handle.dataset.side;
      const entry = state.entries.find((item) => item.calendarId === entryId);
      if (!entry) return;
      const season = handle.closest(".season");

      if (!selectedEntryIds.has(entryId)) {
        setSelection([entryId], false);
      }

      drag.selectedIds = Array.from(selectedEntryIds.size ? selectedEntryIds : [entryId]);
      drag.baseTimes = new Map();
      drag.selectedIds.forEach((id) => {
        const item = state.entries.find((e) => e.calendarId === id);
        if (!item) return;
        const start = parseISO(item.startDateTime);
        const end = parseISO(item.endDateTime);
        if (!start || !end) return;
        drag.baseTimes.set(id, { startMs: start.getTime(), endMs: end.getTime() });
      });

      const base = drag.baseTimes.get(entryId);
      if (!base) return;
      drag.active = true;
      drag.entryId = entryId;
      drag.side = side;
      drag.mode = "resize";
      drag.startX = event.clientX;
      drag.startMs = base.startMs;
      drag.endMs = base.endMs;
      drag.element = season;
      drag.trackName = entry.eventName;
      drag.lastClientX = event.clientX;
      document.body.style.cursor = "ew-resize";
      return;
    }

    if (season) {
      event.preventDefault();
      const entryId = season.dataset.id;
      const entry = state.entries.find((item) => item.calendarId === entryId);
      if (!entry) return;

      if (isToggle) {
        toggleSelection(entryId);
        return;
      }

      if (!selectedEntryIds.has(entryId)) {
        setSelection([entryId], false);
      }

      drag.selectedIds = Array.from(selectedEntryIds.size ? selectedEntryIds : [entryId]);
      drag.baseTimes = new Map();
      drag.selectedIds.forEach((id) => {
        const item = state.entries.find((e) => e.calendarId === id);
        if (!item) return;
        const start = parseISO(item.startDateTime);
        const end = parseISO(item.endDateTime);
        if (!start || !end) return;
        drag.baseTimes.set(id, { startMs: start.getTime(), endMs: end.getTime() });
      });

      const base = drag.baseTimes.get(entryId);
      if (!base) return;
      drag.active = true;
      drag.entryId = entryId;
      drag.side = null;
      drag.mode = "move";
      drag.startX = event.clientX;
      drag.startMs = base.startMs;
      drag.endMs = base.endMs;
      drag.element = season;
      drag.trackName = entry.eventName;
      drag.lastClientX = event.clientX;
      document.body.style.cursor = "grabbing";
    }
  });

  const applyDragMove = (clientX) => {
    if (!drag.active) return;
    const deltaX = clientX - drag.startX;
    const deltaMs = (deltaX / state.zoom) * MS_PER_HOUR;
    const snapMs = SNAP_MINUTES * MS_PER_MINUTE;
    let snappedDelta = Math.round(deltaMs / snapMs) * snapMs;
    const selectedIds = drag.selectedIds && drag.selectedIds.length ? drag.selectedIds : [drag.entryId];
    const excludeSet = new Set(selectedIds);
    let minDelta = -Infinity;
    let maxDelta = Infinity;

    selectedIds.forEach((id) => {
      const base = drag.baseTimes?.get(id);
      const entry = state.entries.find((item) => item.calendarId === id);
      if (!base || !entry) return;
      const neighbors = getTrackNeighbors(entry.eventName, id, base.startMs, excludeSet);
      if (drag.mode === "move") {
        minDelta = Math.max(minDelta, neighbors.prevEndMs - base.startMs);
        maxDelta = Math.min(maxDelta, neighbors.nextStartMs - base.endMs);
      } else if (drag.mode === "resize" && drag.side === "start") {
        minDelta = Math.max(minDelta, neighbors.prevEndMs - base.startMs);
        maxDelta = Math.min(maxDelta, base.endMs - 5 * MS_PER_MINUTE - base.startMs);
      } else if (drag.mode === "resize" && drag.side === "end") {
        minDelta = Math.max(minDelta, base.startMs + 5 * MS_PER_MINUTE - base.endMs);
        maxDelta = Math.min(maxDelta, neighbors.nextStartMs - base.endMs);
      }
    });

    if (minDelta > maxDelta) {
      snappedDelta = 0;
    } else {
      snappedDelta = Math.min(Math.max(snappedDelta, minDelta), maxDelta);
    }

    selectedIds.forEach((id) => {
      const base = drag.baseTimes?.get(id);
      const entry = state.entries.find((item) => item.calendarId === id);
      if (!base || !entry) return;
      let nextStart = base.startMs;
      let nextEnd = base.endMs;

      if (drag.mode === "move") {
        nextStart = base.startMs + snappedDelta;
        nextEnd = base.endMs + snappedDelta;
      } else if (drag.mode === "resize" && drag.side === "start") {
        nextStart = base.startMs + snappedDelta;
      } else if (drag.mode === "resize" && drag.side === "end") {
        nextEnd = base.endMs + snappedDelta;
      }

      entry.startDateTime = formatWithOffset(new Date(nextStart));
      entry.endDateTime = formatWithOffset(new Date(nextEnd));
      const seasonEl = lanes.querySelector(`.season[data-id="${CSS.escape(id)}"]`);
      updateSeasonElement(entry, seasonEl || drag.element);
    });

    updateSeasonFloatLabels();
  };

  window.addEventListener("pointermove", (event) => {
    if (marquee.active) {
      updateMarqueeRect(event.clientX, event.clientY);
      return;
    }
    if (!drag.active) return;
    drag.lastClientX = event.clientX;
    if (drag.rafId) return;
    drag.rafId = requestAnimationFrame(() => {
      drag.rafId = null;
      applyDragMove(drag.lastClientX);
    });
  });

  window.addEventListener("pointerup", (event) => {
    if (marquee.active) {
      finishMarqueeSelection(event);
      return;
    }
    if (!drag.active) return;
    drag.active = false;
    drag.mode = null;
    drag.element = null;
    drag.trackName = null;
    drag.prevEndMs = null;
    drag.nextStartMs = null;
    drag.selectedIds = [];
    drag.baseTimes = null;
    if (drag.rafId) {
      cancelAnimationFrame(drag.rafId);
      drag.rafId = null;
    }
    document.body.style.cursor = "default";
    recalcSurface();
    renderRuler();
    applyViewX();
    syncHeights();
    saveState();
    pushHistory();
  });
}

function syncScrollbars() {
  timelineScroll.addEventListener("scroll", () => {
    if (isSyncingScroll) return;
    isSyncingScroll = true;
    const target = timelineScroll.scrollTop;
    if (Math.abs(tracksBody.scrollTop - target) > 1) {
      tracksBody.scrollTop = target;
    }
    requestAnimationFrame(() => {
      isSyncingScroll = false;
    });
  });

  tracksBody.addEventListener("scroll", () => {
    if (isSyncingScroll) return;
    isSyncingScroll = true;
    const target = tracksBody.scrollTop;
    if (Math.abs(timelineScroll.scrollTop - target) > 1) {
      timelineScroll.scrollTop = target;
    }
    requestAnimationFrame(() => {
      isSyncingScroll = false;
    });
  });
}

function openModal(title, bodyHtml, footerButtons) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalFooter.innerHTML = "";
  footerButtons.forEach((btn) => modalFooter.appendChild(btn));
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

function createButton(label, className, onClick) {
  const btn = document.createElement("button");
  btn.className = `btn ${className || ""}`.trim();
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  requestAnimationFrame(() => {
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2000);
  });
}

function showTrackSeasonsModal(trackName) {
  const entries = state.entries
    .filter((entry) => entry.eventName === trackName)
    .map((entry) => {
      const start = parseISO(entry.startDateTime);
      const end = parseISO(entry.endDateTime);
      const startLabel = start ? formatHourLabel(start) : "";
      const endLabel = end ? formatHourLabel(end) : "";
      const dateLabel = start ? formatDayLabel(start) : "";
      const durationLabel = start && end ? formatDuration(start, end) : "";
      return {
        id: entry.calendarId,
        startMs: start ? start.getTime() : 0,
        label: `${entry.calendarId} • ${dateLabel} • ${startLabel}-${endLabel} • ${durationLabel}`,
      };
    })
    .sort((a, b) => a.startMs - b.startMs);

  const items = entries
    .map(
      (item) =>
        `<button type="button" class="season-list-item" data-id="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>`
    )
    .join("");

  const body = entries.length
    ? `<div class="season-list">${items}</div>`
    : `<div class="helper">No seasons on this track.</div>`;

  const closeBtn = createButton("Close", "primary", closeModal);
  openModal(`Track ${trackName}`, body, [closeBtn]);

  modalBody.querySelectorAll(".season-list-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const entry = state.entries.find((item) => item.calendarId === id);
      if (!entry) return;
      const start = parseISO(entry.startDateTime);
      if (!start) return;
      state.viewX = clampViewX(timeToX(start.getTime()) - state.zoom);
      applyViewX();
      timelineScroll.scrollTop = Math.max(0, (state.trackOrder.indexOf(trackName) || 0) * parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--row-height")));
      setSelectedEntry(entry.calendarId);
      closeModal();
    });
  });
}

function beginTrackRename(row, nameEl, currentName) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "track-name-input";
  input.value = currentName;
  row.draggable = false;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  const finalize = (shouldCommit) => {
    const nextName = input.value.trim();
    row.draggable = true;
    if (!shouldCommit || !nextName || nextName === currentName) {
      input.replaceWith(nameEl);
      return;
    }
    if (state.trackOrder.includes(nextName)) {
      showToast("Track name already exists");
      input.replaceWith(nameEl);
      return;
    }
    state.trackOrder = state.trackOrder.map((name) => (name === currentName ? nextName : name));
    state.hiddenTracks = state.hiddenTracks.map((name) => (name === currentName ? nextName : name));
    state.entries.forEach((entry) => {
      if (entry.eventName === currentName) {
        entry.eventName = nextName;
      }
    });
    saveState();
    pushHistory();
    renderAll();
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      finalize(true);
    }
    if (event.key === "Escape") {
      finalize(false);
    }
  });

  input.addEventListener("blur", () => finalize(true));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showSeasonInfoModal(entry) {
  const start = parseISO(entry.startDateTime);
  const end = parseISO(entry.endDateTime);
  const duration = start && end ? formatDuration(start, end) : "N/A";
  const body = `
    <div class="field">
      <label>Event name (locked)</label>
      <div class="helper">${escapeHtml(entry.eventName)}</div>
    </div>
    <div class="field">
      <label>Calendar ID</label>
      <input type="text" id="seasonEditId" />
    </div>
    <div class="field">
      <label>Start</label>
      <input type="datetime-local" id="seasonEditStart" lang="en-GB" />
    </div>
    <div class="field">
      <label>End</label>
      <input type="datetime-local" id="seasonEditEnd" lang="en-GB" />
    </div>
    <div class="field">
      <label>Duration</label>
      <div class="helper">${escapeHtml(duration)}</div>
    </div>
    <div class="field">
      <label>Min duration (hours)</label>
      <input type="number" id="seasonEditMin" min="0" step="0.5" />
    </div>
    <div class="field">
      <label>Config URL</label>
      <input type="url" id="seasonEditUrl" placeholder="https://..." />
    </div>
  `;
  const saveBtn = createButton("Save", "primary", () => {
    const idValue = document.getElementById("seasonEditId").value.trim();
    const startValue = document.getElementById("seasonEditStart").value;
    const endValue = document.getElementById("seasonEditEnd").value;
    const minValue = document.getElementById("seasonEditMin").value;
    const urlValue = document.getElementById("seasonEditUrl").value.trim();
    if (!idValue) {
      showToast("Please enter calendar ID");
      return;
    }
    if (idValue !== entry.calendarId && state.entries.some((item) => item.calendarId === idValue)) {
      showToast("Calendar ID already exists");
      return;
    }
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
    if (hasTrackOverlap(entry.eventName, nextStart.getTime(), nextEnd.getTime(), entry.calendarId)) {
      showToast("Season overlaps another on the same track");
      return;
    }
    const prevId = entry.calendarId;
    entry.calendarId = idValue;
    entry.startDateTime = formatWithOffset(nextStart);
    entry.endDateTime = formatWithOffset(nextEnd);
    entry.minDurationHours = parseFloat(minValue) || 0;
    entry.urlConfig = urlValue;
    if (selectedEntryId === prevId) {
      selectedEntryId = idValue;
    }
    saveState();
    pushHistory();
    renderAll();
    closeModal();
    showToast("Season updated");
  });
  const closeBtn = createButton("Close", "", closeModal);
  openModal("Season details", body, [closeBtn, saveBtn]);
  document.getElementById("seasonEditId").value = entry.calendarId || "";
  if (start) document.getElementById("seasonEditStart").value = toLocalInput(start);
  if (end) document.getElementById("seasonEditEnd").value = toLocalInput(end);
  document.getElementById("seasonEditMin").value = entry.minDurationHours ?? 0;
  document.getElementById("seasonEditUrl").value = entry.urlConfig || "";
}

function setupTimezoneSelect() {
  if (!timezoneSelect) return;
  const tzOptions = [
    { value: -720, label: "UTC-12" },
    { value: -600, label: "UTC-10" },
    { value: -480, label: "UTC-8" },
    { value: -420, label: "UTC-7" },
    { value: -360, label: "UTC-6" },
    { value: -300, label: "UTC-5" },
    { value: -240, label: "UTC-4" },
    { value: -180, label: "UTC-3" },
    { value: 0, label: "UTC+0" },
    { value: 60, label: "UTC+1" },
    { value: 120, label: "UTC+2" },
    { value: 180, label: "UTC+3" },
    { value: 240, label: "UTC+4" },
    { value: 300, label: "UTC+5" },
    { value: 330, label: "UTC+5:30" },
    { value: 360, label: "UTC+6" },
    { value: 420, label: "UTC+7" },
    { value: 480, label: "UTC+8" },
    { value: 540, label: "UTC+9" },
    { value: 600, label: "UTC+10" },
    { value: 660, label: "UTC+11" },
    { value: 720, label: "UTC+12" },
    { value: 780, label: "UTC+13" },
    { value: 840, label: "UTC+14" },
  ];

  timezoneSelect.innerHTML = "";
  tzOptions.forEach((option) => {
    const opt = document.createElement("option");
    opt.value = String(option.value);
    opt.textContent = option.label;
    timezoneSelect.appendChild(opt);
  });

  if (!tzOptions.some((option) => option.value === state.timeZoneOffsetMinutes)) {
    const custom = document.createElement("option");
    const sign = state.timeZoneOffsetMinutes >= 0 ? "+" : "-";
    const abs = Math.abs(state.timeZoneOffsetMinutes);
    const hours = Math.floor(abs / 60);
    const mins = abs % 60;
    const label = mins ? `UTC${sign}${hours}:${String(mins).padStart(2, "0")}` : `UTC${sign}${hours}`;
    custom.value = String(state.timeZoneOffsetMinutes);
    custom.textContent = label;
    timezoneSelect.appendChild(custom);
  }

  timezoneSelect.value = String(state.timeZoneOffsetMinutes);
  timezoneSelect.addEventListener("change", () => {
    state.timeZoneOffsetMinutes = Number(timezoneSelect.value);
    localStorage.setItem(TIMEZONE_KEY, String(state.timeZoneOffsetMinutes));
    renderAll();
    updateNowLine(false);
  });
}

function showNewSeasonModal() {
  const datalistId = "trackOptions";
  const options = state.trackOrder.map((name) => `<option value="${name}"></option>`).join("");
  const now = new Date();
  const next = new Date(now.getTime() + MS_PER_HOUR);
  const nextId = getNextCalendarId();
  const body = `
    <div class="field">
      <label>Track (eventName)</label>
      <input list="${datalistId}" id="seasonTrack" placeholder="LE1" />
      <datalist id="${datalistId}">${options}</datalist>
    </div>
    <div class="field">
      <label>Calendar ID</label>
      <input type="text" id="seasonId" />
    </div>
    <div class="field">
      <label>Start time</label>
      <input type="datetime-local" id="seasonStart" lang="en-GB" />
    </div>
    <div class="field">
      <label>End time</label>
      <input type="datetime-local" id="seasonEnd" lang="en-GB" />
    </div>
    <div class="field">
      <label>Config URL</label>
      <input type="url" id="seasonUrl" placeholder="https://..." />
    </div>
    <div class="field">
      <label>Min duration (hours)</label>
      <input type="number" id="seasonMin" min="0" step="0.5" value="0" />
    </div>
  `;

  const createBtn = createButton("Create", "primary", () => {
    const track = document.getElementById("seasonTrack").value.trim();
    const calendarId = document.getElementById("seasonId").value.trim();
    const startValue = document.getElementById("seasonStart").value;
    const endValue = document.getElementById("seasonEnd").value;
    const url = document.getElementById("seasonUrl").value.trim();
    const minDuration = parseFloat(document.getElementById("seasonMin").value) || 0;

    if (!track) {
      showToast("Please enter track name");
      return;
    }
    if (!calendarId) {
      showToast("Please enter calendar ID");
      return;
    }
    if (state.entries.some((entry) => entry.calendarId === calendarId)) {
      showToast("Calendar ID already exists");
      return;
    }
    if (!startValue || !endValue) {
      showToast("Please select start/end time");
      return;
    }
    const start = new Date(startValue);
    const end = new Date(endValue);
    if (!(start < end)) {
      showToast("End must be after start");
      return;
    }
    if (hasTrackOverlap(track, start.getTime(), end.getTime(), null)) {
      showToast("Season overlaps another on the same track");
      return;
    }

    const entry = {
      eventName: track,
      calendarId,
      startDateTime: formatWithOffset(start),
      endDateTime: formatWithOffset(end),
      minDurationHours: minDuration,
      urlConfig: url,
    };
    state.entries.push(entry);
    if (!state.trackOrder.includes(track)) {
      state.trackOrder.push(track);
    }
    saveState();
    pushHistory();
    renderAll();
    closeModal();
    showToast("Season created");
  });

  const cancelBtn = createButton("Cancel", "", closeModal);
  openModal("New Season", body, [cancelBtn, createBtn]);

  document.getElementById("seasonStart").value = toLocalInput(now);
  document.getElementById("seasonEnd").value = toLocalInput(next);
  document.getElementById("seasonId").value = nextId;
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

function showExportModal() {
  const visibleEntries = state.entries.filter((entry) => !state.hiddenTracks.includes(entry.eventName));
  const output = JSON.stringify({ entries: visibleEntries }, null, 2);
  const body = `
    <div class="field">
      <label>Config output</label>
      <textarea readonly id="exportOutput">${output.replace(/</g, "&lt;")}</textarea>
      <div class="helper">Readonly. Use copy to clipboard.</div>
    </div>
  `;
  const copyBtn = createButton("Copy", "primary", async () => {
    await navigator.clipboard.writeText(output);
    showToast("Copied to clipboard");
  });
  const closeBtn = createButton("Close", "", closeModal);
  openModal("Export config", body, [closeBtn, copyBtn]);
}

function validateImport(payload) {
  if (!payload || !Array.isArray(payload.entries)) {
    return "Invalid format. Expect { entries: [] }.";
  }
  for (const entry of payload.entries) {
    if (!entry.eventName || !entry.startDateTime || !entry.endDateTime) {
      return "Each entry needs eventName, startDateTime, endDateTime";
    }
    if (!parseISO(entry.startDateTime) || !parseISO(entry.endDateTime)) {
      return "Invalid date format in entries";
    }
  }
  return null;
}

function showImportModal() {
  const body = `
    <div class="notice">Paste JSON config in the exact format of sample-output.json.</div>
    <div class="field">
      <label>Config input</label>
      <textarea id="importInput" placeholder='{"entries": []}'></textarea>
    </div>
  `;

  const importBtn = createButton("Import", "primary", () => {
    const raw = document.getElementById("importInput").value.trim();
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
    state.entries = payload.entries;
    state.trackOrder = uniqueTracks(state.entries);
    selectedEntryId = null;
    selectedEntryIds.clear();
    state.hiddenTracks = [];
    saveState();
    pushHistory();
    renderAll();
    closeModal();
    showToast("Import success");
  });

  const cancelBtn = createButton("Cancel", "", closeModal);
  openModal("Import config", body, [cancelBtn, importBtn]);
}


function showClearModal() {
  const body = `
    <div class="notice">This will remove all timeline entries and track order from local storage.</div>
    <div class="helper">Action cannot be undone.</div>
  `;
  const clearBtn = createButton("Clear", "primary", () => {
    state.entries = [];
    state.trackOrder = [];
    selectedEntryId = null;
    selectedEntryIds.clear();
    state.hiddenTracks = [];
    localStorage.removeItem(STORAGE_KEY);
    pushHistory();
    renderAll();
    closeModal();
    showToast("Data cleared");
  });
  const cancelBtn = createButton("Cancel", "", closeModal);
  openModal("Clear data", body, [cancelBtn, clearBtn]);
}

async function syncNowFromServer() {
  try {
    const response = await fetch("https://1.1.1.1", { method: "GET" });
    const dateHeader = response.headers.get("date");
    if (dateHeader) {
      const serverMs = Date.parse(dateHeader);
      if (!Number.isNaN(serverMs)) {
        nowOffsetMs = serverMs - Date.now();
        return;
      }
    }
    const text = await response.text();
    const match = text.match(/ts=(\d+)/);
    if (match) {
      const serverMs = Number(match[1]) * 1000;
      if (Number.isFinite(serverMs)) {
        nowOffsetMs = serverMs - Date.now();
      }
    }
  } catch (err) {
    console.warn("Failed to sync time from 1.1.1.1", err);
  }
}

function setupZoomInput() {
  if (!zoomInput) return;
  const clampPercent = (value) => Math.min(1000, Math.max(0.1, value));
  zoomInput.value = String(Math.round((state.zoom / BASE_ZOOM) * 100));
  zoomInput.addEventListener("change", () => {
    const raw = Number(zoomInput.value);
    if (!Number.isFinite(raw)) return;
    const percent = clampPercent(raw);
    zoomInput.value = String(percent);
    state.zoom = (BASE_ZOOM * percent) / 100;
    updateZoomLayout();
    saveState();
  });
}

async function bootstrap() {
  await syncNowFromServer();
  const savedTimezone = localStorage.getItem(TIMEZONE_KEY);
  if (savedTimezone) {
    const parsed = Number(savedTimezone);
    if (Number.isFinite(parsed)) {
      state.timeZoneOffsetMinutes = parsed;
    } else {
      const map = {
        UTC: 0,
        "Asia/Ho_Chi_Minh": 420,
        "Asia/Tokyo": 540,
        "Australia/Sydney": 600,
        "Europe/London": 0,
        "America/New_York": -300,
        "America/Los_Angeles": -480,
        local: getLocalOffsetMinutes(),
      };
      if (Object.prototype.hasOwnProperty.call(map, savedTimezone)) {
        state.timeZoneOffsetMinutes = map[savedTimezone];
      }
    }
  }
  const saved = loadState();
  if (saved && Array.isArray(saved.entries)) {
    state.entries = saved.entries;
    state.trackOrder = saved.trackOrder && saved.trackOrder.length ? saved.trackOrder : uniqueTracks(state.entries);
    state.hiddenTracks = Array.isArray(saved.hiddenTracks) ? saved.hiddenTracks : [];
  } else {
    try {
      const response = await fetch("Config/sample-output.json");
      const data = await response.json();
      state.entries = data.entries || [];
      state.trackOrder = uniqueTracks(state.entries);
      state.hiddenTracks = [];
    } catch (err) {
      console.warn("Failed to load sample-output.json", err);
      state.entries = [];
      state.trackOrder = [];
      state.hiddenTracks = [];
    }
  }
  setupTimezoneSelect();
  setupZoomInput();
  renderAll();
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
  requestAnimationFrame(() => {
    focusOnNow();
    updateNowLine(false);
    requestAnimationFrame(() => {
      focusOnNow();
      updateNowLine(false);
    });
  });
  pushHistory();
  setInterval(() => updateNowLine(false), 10000);
}

btnNewSeason.addEventListener("click", showNewSeasonModal);
btnImport.addEventListener("click", showImportModal);
btnClear.addEventListener("click", showClearModal);
btnExport.addEventListener("click", showExportModal);
modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", (event) => {
  if (event.target.dataset.close) closeModal();
});

timelineScroll.addEventListener("wheel", onWheelTimeline, { passive: false });

window.addEventListener("keydown", (event) => {
  const isCtrl = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (key === "delete" || key === "backspace") {
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
    deleteSelectedSeason();
    return;
  }
  if (!isCtrl) return;
  if (key === "z" && !event.shiftKey) {
    event.preventDefault();
    if (state.history.undo.length < 2) return;
    const current = state.history.undo.pop();
    state.history.redo.push(current);
    const prev = state.history.undo[state.history.undo.length - 1];
    applySnapshot(prev);
    return;
  }
  if (key === "y" || (key === "z" && event.shiftKey)) {
    event.preventDefault();
    if (!state.history.redo.length) return;
    const next = state.history.redo.pop();
    state.history.undo.push(next);
    applySnapshot(next);
  }
  if (key === "a") {
    event.preventDefault();
    const ids = state.entries.map((entry) => entry.calendarId);
    setSelection(ids, false);
    return;
  }
  if (key === "d") {
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
    duplicateSelectedSeason();
  }
});

bindResizeHandles();
bindPan();
bindHoverLine();
bindSeasonSelection();
syncScrollbars();
bootstrap();
