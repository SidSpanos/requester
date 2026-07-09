import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads DATA_DIR/event.txt — line 1 is the heading, line 2 is the tagline. Lives in
 * DATA_DIR (not public/) so it can be edited per-event directly on the NAS without a
 * code redeploy. Missing file just means no heading/tagline is shown.
 */
export function loadEvent(dataDir) {
  const path = join(dataDir, "event.txt");
  if (!existsSync(path)) {
    return { heading: "", tagline: "" };
  }
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  return {
    heading: (lines[0] || "").trim(),
    tagline: (lines[1] || "").trim(),
  };
}
