const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
try {
  Object.defineProperty(navigator, 'userAgent', { get: () => DESKTOP_UA, configurable: true });
  Object.defineProperty(navigator, 'platform', { get: () => 'Win32', configurable: true });
} catch (e) {
  console.error("Не удалось подменить User-Agent:", e);
}

import {
  parseSpotifyInput,
  getEmbedHeight,
  TYPE_LABELS,
  fetchOEmbedTitle,
} from "./embed.js";
import {
  getTracks,
  saveTracks,
  getLastSelectedId,
  setLastSelectedId,
  makeTrackId,
} from "./store.js";

import { fetchAudioStreamUrl } from "./stream.js";
// --- DOM references -------------------------------------------------------
const els = {
  form: document.getElementById("add-form"),
  input: document.getElementById("add-input"),
  feedback: document.getElementById("add-form-feedback"),
  list: document.getElementById("track-list"),
  count: document.getElementById("library-count"),
  emptyState: document.getElementById("library-empty"),
  nowPlaying: document.getElementById("now-playing-embed"),
  exportBtn: document.getElementById("export-btn"),
  importInput: document.getElementById("import-input"),
};

// --- State ------------------------------------------------------------
let tracks = getTracks();
let activeId = getLastSelectedId();

// Migrate tracks saved by an older version of the app that didn't store
// the exact embedUrl yet.
const needsMigration = tracks.some((t) => !t.embedUrl);
if (needsMigration) {
  tracks = tracks.map((t) => ({
    ...t,
    embedUrl:
      t.embedUrl ??
      `https://open.spotify.com/embed/${t.type}/${t.spotifyId}?utm_source=generator`,
  }));
  saveTracks(tracks);
}

// --- Rendering -------------------------------------------------------------
const pluralize = (n) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "трек";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "трека";
  return "треков";
};

const renderCount = () => {
  els.count.textContent = `${tracks.length} ${pluralize(tracks.length)}`;
};

const renderEmptyState = () => {
  els.emptyState.dataset.visible = tracks.length === 0 ? "true" : "false";
};

const renderNowPlaying = async () => {
  const track = tracks.find((t) => t.id === activeId);

  // Если трек не выбран — показываем дефолтный экран
  if (!track) {
    els.nowPlaying.innerHTML = `
      <div class="empty-state" id="now-playing-empty">
        <svg class="empty-state__icon" width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <circle cx="20" cy="20" r="19" stroke="currentColor" stroke-width="1.5" />
          <path d="M16 14.5v11l9-5.5-9-5.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
        </svg>
        <p>Выберите трек из библиотеки — он появится здесь</p>
      </div>`;
    return;
  }

  // Выводим индикатор загрузки, пока ищется аудиопоток
  els.nowPlaying.innerHTML = `
    <div class="empty-state">
      <div class="spinner" style="border: 3px solid var(--color-canvas-soft); border-top: 3px solid var(--color-primary); border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite;"></div>
      <p style="margin-top: 10px;">Получаем аудиопоток для:<br><strong>${escapeHtml(track.title)}</strong></p>
    </div>
    <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
  `;

  try {
    // Вызываем поиск аудиопотока по названию, сохраненному в вашей библиотеке
    const streamUrl = await fetchAudioStreamUrl(track.title);

    // Очищаем контейнер и создаем наш собственный независимый плеер
    els.nowPlaying.innerHTML = "";
    
    const playerWrapper = document.createElement("div");
    playerWrapper.className = "custom-audio-player";
    playerWrapper.style.padding = "var(--space-md)";
    playerWrapper.style.display = "flex";
    playerWrapper.style.flexDirection = "column";
    playerWrapper.style.gap = "var(--space-sm)";

    // Название текущего трека над плеером
    const trackInfo = document.createElement("div");
    trackInfo.innerHTML = `
      <div style="font-weight: 700; font-size: 16px; color: var(--color-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        ${escapeHtml(track.title)}
      </div>
      <div style="font-size: 12px; color: var(--color-body-mid); text-transform: uppercase; font-weight: 600;">
        ${escapeHtml(track.type)} • Стрим без ограничений
      </div>
    `;

    // Создаем стандартный HTML5 аудио-элемент
    const audioEl = document.createElement("audio");
    audioEl.src = streamUrl;
    audioEl.controls = true;
    audioEl.autoplay = true; // Начинать играть сразу при выборе
    audioEl.style.width = "100%";
    audioEl.style.marginTop = "var(--space-xs)";
    
    // Кастомные стили для интеграции в ваш дизайн (перебиваем дефолтный цвет хрома под ваш --color-primary)
    audioEl.style.borderRadius = "var(--radius-sm)";

    playerWrapper.appendChild(trackInfo);
    playerWrapper.appendChild(audioEl);
    els.nowPlaying.appendChild(playerWrapper);

  } catch (error) {
    // Если трек не нашелся (например, название в базе осталось в виде плейсхолдера "Трек • 1a2b3c")
    els.nowPlaying.innerHTML = `
      <div class="empty-state" style="color: var(--color-primary)">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <p>Не удалось запустить поток. Переименуйте трек вручную (значок ✎), указав точное имя артиста и песни, и попробуйте снова.</p>
      </div>`;
    console.error(error);
  }
};

const trackCardTemplate = (track) => {
  const isActive = track.id === activeId;
  const label = TYPE_LABELS[track.type] ?? track.type;

  return `
    <li class="track-card" data-id="${track.id}" data-active="${isActive}">
      <button
        type="button"
        class="track-card__select"
        data-action="select"
        aria-pressed="${isActive}"
      >
        <span class="track-card__title">${escapeHtml(track.title)}</span>
        <span class="track-card__meta">
          <span class="track-card__type">${escapeHtml(label)}</span>
        </span>
      </button>
      <div class="track-card__actions">
        <button
          type="button"
          class="icon-button"
          data-action="rename"
          aria-label="Переименовать «${escapeHtml(track.title)}»"
          title="Переименовать"
        >✎</button>
        <button
          type="button"
          class="icon-button icon-button--danger"
          data-action="remove"
          aria-label="Удалить «${escapeHtml(track.title)}» из библиотеки"
          title="Удалить"
        >✕</button>
      </div>
    </li>`;
};

const escapeHtml = (str) =>
  str.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);

const renderList = () => {
  els.list.innerHTML = tracks.map(trackCardTemplate).join("");
  renderCount();
  renderEmptyState();
};

const renderAll = () => {
  renderList();
  renderNowPlaying();
};

// --- Persistence helpers ----------------------------------------------
const persistTracks = () => saveTracks(tracks);

const setActive = (id) => {
  activeId = id;
  setLastSelectedId(id);
  renderList();
  renderNowPlaying();
};

// --- Feedback -----------------------------------------------------------
let feedbackTimer = null;
const setFeedback = (message, tone) => {
  clearTimeout(feedbackTimer);
  els.feedback.textContent = message;
  if (tone) {
    els.feedback.dataset.tone = tone;
  } else {
    delete els.feedback.dataset.tone;
  }
  if (message) {
    feedbackTimer = setTimeout(() => {
      els.feedback.textContent = "";
      delete els.feedback.dataset.tone;
    }, 4000);
  }
};

// --- Add track flow -------------------------------------------------------
const handleAddSubmit = async (event) => {
  event.preventDefault();
  const raw = els.input.value.trim();
  if (!raw) return;

  const parsed = parseSpotifyInput(raw);
  if (!parsed) {
    setFeedback(
      "Не нашли ссылку Spotify в этом тексте. Проверьте, что это open.spotify.com/... или embed-код.",
      "error"
    );
    return;
  }

  const duplicate = tracks.find((t) => t.type === parsed.type && t.spotifyId === parsed.id);
  if (duplicate) {
    setFeedback("Этот трек уже в библиотеке.", "error");
    setActive(duplicate.id);
    els.input.value = "";
    return;
  }

  const placeholderTitle = `${TYPE_LABELS[parsed.type] ?? "Трек"} · ${parsed.id.slice(0, 6)}`;

  const newTrack = {
    id: makeTrackId(),
    type: parsed.type,
    spotifyId: parsed.id,
    embedUrl: parsed.embedUrl,
    title: placeholderTitle,
    addedAt: Date.now(),
  };

  tracks = [newTrack, ...tracks];
  persistTracks();
  renderAll();
  setActive(newTrack.id);
  els.input.value = "";
  setFeedback("Добавлено. Ищем название трека…", "success");

  // Best-effort title lookup; UI already works fine if this fails.
  const title = await fetchOEmbedTitle({ type: parsed.type, id: parsed.id });
  if (title) {
    tracks = tracks.map((t) => (t.id === newTrack.id ? { ...t, title } : t));
    persistTracks();
    renderList();
    if (activeId === newTrack.id) {
      // Keep the iframe's title attribute in sync without reloading it.
      const iframe = els.nowPlaying.querySelector("iframe");
      if (iframe) iframe.title = title;
    }
    setFeedback("Готово.", "success");
  } else {
    setFeedback("Добавлено. Название не удалось определить — переименуйте вручную.", "success");
  }
};

// --- List interactions (event delegation) ----------------------------
const handleListClick = (event) => {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;
  const card = event.target.closest(".track-card");
  if (!card) return;
  const { id } = card.dataset;
  const { action } = actionEl.dataset;

  if (action === "select") {
    setActive(id);
    return;
  }

  if (action === "remove") {
    const track = tracks.find((t) => t.id === id);
    const confirmed = window.confirm(`Удалить «${track?.title ?? "трек"}» из библиотеки?`);
    if (!confirmed) return;
    tracks = tracks.filter((t) => t.id !== id);
    persistTracks();
    if (activeId === id) {
      activeId = null;
      setLastSelectedId(null);
    }
    renderAll();
    return;
  }

  if (action === "rename") {
    const track = tracks.find((t) => t.id === id);
    if (!track) return;
    const nextTitle = window.prompt("Новое название трека:", track.title);
    if (!nextTitle || !nextTitle.trim()) return;
    tracks = tracks.map((t) => (t.id === id ? { ...t, title: nextTitle.trim() } : t));
    persistTracks();
    renderList();
    if (activeId === id) {
      const iframe = els.nowPlaying.querySelector("iframe");
      if (iframe) iframe.title = nextTitle.trim();
    }
  }
};

// --- Export / import ----------------------------------------------------
const handleExport = () => {
  const blob = new Blob([JSON.stringify(tracks, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "spotify-player-library.json";
  link.click();
  URL.revokeObjectURL(url);
};

const handleImport = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    if (!Array.isArray(imported)) throw new Error("bad shape");

    const existingKeys = new Set(tracks.map((t) => `${t.type}:${t.spotifyId}`));
    const additions = imported
      .filter((t) => t?.type && t?.spotifyId && t?.title)
      .filter((t) => !existingKeys.has(`${t.type}:${t.spotifyId}`))
      .map((t) => ({
        ...t,
        id: t.id ?? makeTrackId(),
        // Older exports (before embedUrl existed) get a best-effort rebuild.
        embedUrl:
          t.embedUrl ??
          `https://open.spotify.com/embed/${t.type}/${t.spotifyId}?utm_source=generator`,
      }));

    tracks = [...additions, ...tracks];
    persistTracks();
    renderAll();
    setFeedback(`Импортировано треков: ${additions.length}.`, "success");
  } catch {
    setFeedback("Не удалось прочитать файл библиотеки.", "error");
  } finally {
    event.target.value = "";
  }
};

// --- Init -----------------------------------------------------------------
export const initApp = () => {
  els.form.addEventListener("submit", handleAddSubmit);
  els.list.addEventListener("click", handleListClick);
  els.exportBtn.addEventListener("click", handleExport);
  els.importInput.addEventListener("change", handleImport);

  if (activeId && !tracks.some((t) => t.id === activeId)) {
    activeId = null;
  }

  renderAll();
};
