/**
 * Thin persistence layer over localStorage. Keeps the rest of the app
 * free of storage details and easy to swap out later.
 */

const LIBRARY_KEY = "spotify-player:library";
const LAST_SELECTED_KEY = "spotify-player:last-selected";

const readJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJSON = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export const getTracks = () => readJSON(LIBRARY_KEY, []);

export const saveTracks = (tracks) => writeJSON(LIBRARY_KEY, tracks);

export const getLastSelectedId = () => readJSON(LAST_SELECTED_KEY, null);

export const setLastSelectedId = (id) => writeJSON(LAST_SELECTED_KEY, id);

export const makeTrackId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
