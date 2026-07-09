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

/** Prepends a new request (most recent first) and trims to MAX_ENTRIES. */
export function appendRequest(dataDir, entry) {
  const log = loadRequestsLog(dataDir);
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
