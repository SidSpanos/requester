import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MAX_ENTRIES = 200;

function logPath(dataDir) {
  return join(dataDir, "requests.json");
}

export function loadRequestsLog(dataDir) {
  const path = logPath(dataDir);
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Prepends a new request (most recent first) and trims to MAX_ENTRIES. A no-op if
 * this URI is already tracked — the same track can reach here via two independent
 * paths (playlist polling vs. a manually-forwarded Deezload message), and we never
 * want a duplicate card on the board.
 */
export function appendRequest(dataDir, entry) {
  const log = loadRequestsLog(dataDir);
  if (log.some((r) => r.uri === entry.uri)) return log;
  log.unshift(entry);
  const trimmed = log.slice(0, MAX_ENTRIES);
  writeFileSync(logPath(dataDir), JSON.stringify(trimmed, null, 2), "utf8");
  return trimmed;
}

/**
 * Clears the displayed requests log only — does not touch state.json (the Spotify
 * dedup baseline), so already-seen tracks won't be re-forwarded to Deezload.
 */
export function clearRequestsLog(dataDir) {
  writeFileSync(logPath(dataDir), JSON.stringify([], null, 2), "utf8");
  return [];
}

/**
 * Patches an existing request's display fields (name/artists/imageUrl) — used to
 * enrich a manually-forwarded request once its real Spotify metadata becomes
 * available, since it's initially added with just a generic placeholder.
 */
export function updateRequestMetadata(dataDir, uri, patch) {
  const log = loadRequestsLog(dataDir);
  const entry = log.find((r) => r.uri === uri);
  if (entry) {
    Object.assign(entry, patch);
    writeFileSync(logPath(dataDir), JSON.stringify(log, null, 2), "utf8");
  }
  return log;
}

/** Marks a request as played (manual DJ input) — moves it into the played carousel. */
export function markPlayed(dataDir, uri) {
  const log = loadRequestsLog(dataDir);
  const entry = log.find((r) => r.uri === uri);
  if (entry) {
    entry.played = true;
    entry.playedAt = new Date().toISOString();
    writeFileSync(logPath(dataDir), JSON.stringify(log, null, 2), "utf8");
  }
  return log;
}
