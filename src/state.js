import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function statePath(dataDir) {
  return join(dataDir, "state.json");
}

/**
 * Returns the previously-seen ordered list of track URIs, or null if no
 * state file exists yet (i.e. this is the very first run).
 */
export function loadState(dataDir) {
  const path = statePath(dataDir);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.uris) ? parsed.uris : [];
}

export function saveState(dataDir, uris) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    statePath(dataDir),
    JSON.stringify({ uris, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}
