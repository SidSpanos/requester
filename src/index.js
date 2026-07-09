import "dotenv/config";
import { mkdirSync } from "node:fs";
import { getPlaylistTracks, getTrackMetadata, loadRefreshToken, saveRefreshToken } from "./spotify.js";
import { createTelegramClient, sendToDeezload, watchOutgoingDeezloadMessages } from "./telegram.js";
import { loadState, saveState } from "./state.js";
import {
  loadRequestsLog,
  appendRequest,
  clearRequestsLog,
  markPlayed as markRequestPlayed,
  updateRequestMetadata,
} from "./requests-log.js";
import { createHttpServer } from "./server.js";
import { loadEvent } from "./event.js";

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_PLAYLIST_ID,
  TELEGRAM_API_ID,
  TELEGRAM_API_HASH,
  DEEZLOAD_USERNAME,
  POLL_INTERVAL_MS = "12000",
  PORT = "8787",
  DATA_DIR = "./data",
} = process.env;

for (const [name, value] of Object.entries({
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_PLAYLIST_ID,
  TELEGRAM_API_ID,
  TELEGRAM_API_HASH,
  DEEZLOAD_USERNAME,
})) {
  if (!value) {
    console.error(`Missing required env var: ${name} (see .env.example)`);
    process.exit(1);
  }
}

const pollIntervalMs = Number(POLL_INTERVAL_MS);
const apiId = Number(TELEGRAM_API_ID);

mkdirSync(DATA_DIR, { recursive: true });

let spotifyRefreshToken = loadRefreshToken(DATA_DIR);
if (!spotifyRefreshToken) {
  console.error(`No Spotify refresh token found in ${DATA_DIR}. Run "npm run spotify-login" once first.`);
  process.exit(1);
}

const status = {
  startedAt: new Date().toISOString(),
  pollIntervalMs,
  lastPollAt: null,
  lastPollOk: null,
  lastError: null,
  lastTrackSent: null,
  knownTrackCount: 0,
  rateLimitedUntil: null,
};

let requestsLog = loadRequestsLog(DATA_DIR);

createHttpServer(Number(PORT), {
  getStatus: () => status,
  getRequests: () => requestsLog,
  clearRequests: () => {
    requestsLog = clearRequestsLog(DATA_DIR);
    console.log("Requests board cleared (playlist and Telegram forwarding state untouched).");
  },
  markPlayed: (uri) => {
    requestsLog = markRequestPlayed(DATA_DIR, uri);
  },
  getEvent: () => loadEvent(DATA_DIR),
});

console.log("Connecting to Telegram...");
const telegramClient = await createTelegramClient({ apiId, apiHash: TELEGRAM_API_HASH, dataDir: DATA_DIR });
console.log("Telegram connected.");

// Catches Spotify links sent to Deezload some other way (manually pasted, or
// forwarded from a direct DM) so they still show up on the board — independent of
// the playlist poller, so this keeps working even during a Spotify API lockout.
watchOutgoingDeezloadMessages(telegramClient, DEEZLOAD_USERNAME, async (trackId) => {
  const uri = `spotify:track:${trackId}`;
  if (requestsLog.some((r) => r.uri === uri)) return; // already tracked via the poller

  const fallbackUrl = `https://open.spotify.com/track/${trackId}`;
  requestsLog = appendRequest(DATA_DIR, {
    uri,
    name: "Song request",
    artists: "(details loading…)",
    imageUrl: null,
    url: fallbackUrl,
    addedAt: new Date().toISOString(),
    played: false,
    playedAt: null,
  });
  console.log(`Manual Deezload send detected: ${fallbackUrl} — added to board.`);

  try {
    const meta = await getTrackMetadata({
      clientId: SPOTIFY_CLIENT_ID,
      clientSecret: SPOTIFY_CLIENT_SECRET,
      refreshToken: spotifyRefreshToken,
      trackId,
    });
    if (meta.refreshToken !== spotifyRefreshToken) {
      spotifyRefreshToken = meta.refreshToken;
      saveRefreshToken(DATA_DIR, spotifyRefreshToken);
    }
    requestsLog = updateRequestMetadata(DATA_DIR, uri, {
      name: meta.name,
      artists: meta.artists,
      imageUrl: meta.imageUrl,
    });
  } catch (err) {
    console.warn(`Could not enrich manual request metadata (will keep showing generic): ${err.message}`);
  }
});

let previousUris = loadState(DATA_DIR);
if (previousUris === null) {
  console.log("No prior state found — this run will seed a baseline without sending anything.");
}

let isPolling = false;
let rateLimitedUntil = 0;

async function sendWithRetry(track, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await sendToDeezload(telegramClient, DEEZLOAD_USERNAME, track.url);
      return true;
    } catch (err) {
      console.error(`Send attempt ${i}/${attempts} failed for "${track.name}": ${err.message}`);
      if (i < attempts) {
        await new Promise((r) => setTimeout(r, 1000 * 3 ** (i - 1)));
      }
    }
  }
  return false;
}

async function pollOnce() {
  if (isPolling) return; // don't overlap runs if a poll is still in flight
  if (Date.now() < rateLimitedUntil) return; // Spotify told us to back off — skip silently
  isPolling = true;
  try {
    const { tracks, refreshToken: newRefreshToken } = await getPlaylistTracks({
      clientId: SPOTIFY_CLIENT_ID,
      clientSecret: SPOTIFY_CLIENT_SECRET,
      refreshToken: spotifyRefreshToken,
      playlistId: SPOTIFY_PLAYLIST_ID,
    });
    if (newRefreshToken !== spotifyRefreshToken) {
      spotifyRefreshToken = newRefreshToken;
      saveRefreshToken(DATA_DIR, spotifyRefreshToken);
    }
    const currentUris = tracks.map((t) => t.uri);

    if (previousUris === null) {
      saveState(DATA_DIR, currentUris);
      previousUris = currentUris;
      status.knownTrackCount = currentUris.length;
      console.log(`Baseline captured: ${currentUris.length} existing tracks. Future adds will be forwarded.`);
    } else {
      const previousSet = new Set(previousUris);
      const newTracks = tracks.filter((t) => !previousSet.has(t.uri));

      for (const track of newTracks) {
        if (!track.url) {
          console.warn(`Skipping "${track.name}" — no public Spotify URL.`);
          continue;
        }

        requestsLog = appendRequest(DATA_DIR, {
          uri: track.uri,
          name: track.name,
          artists: track.artists,
          imageUrl: track.imageUrl,
          url: track.url,
          addedAt: new Date().toISOString(),
          played: false,
          playedAt: null,
        });

        console.log(`New track: "${track.name}" — ${track.artists} -> forwarding to @${DEEZLOAD_USERNAME}`);
        const ok = await sendWithRetry(track);
        if (ok) {
          status.lastTrackSent = { name: track.name, artists: track.artists, url: track.url, at: new Date().toISOString() };
        } else {
          console.error(`Giving up on "${track.name}" after retries — forward it manually.`);
        }
      }

      saveState(DATA_DIR, currentUris);
      previousUris = currentUris;
      status.knownTrackCount = currentUris.length;
    }

    status.lastPollOk = true;
    status.lastError = null;
    status.rateLimitedUntil = null;
  } catch (err) {
    status.lastPollOk = false;
    status.lastError = err.message;
    if (err.retryAfterMs) {
      rateLimitedUntil = Date.now() + err.retryAfterMs;
      status.rateLimitedUntil = new Date(rateLimitedUntil).toISOString();
      console.error(`Spotify rate-limited us — backing off until ${status.rateLimitedUntil}`);
    } else {
      console.error(`Poll failed: ${err.message}`);
    }
  } finally {
    status.lastPollAt = new Date().toISOString();
    isPolling = false;
  }
}

await pollOnce();
const interval = setInterval(pollOnce, pollIntervalMs);

async function shutdown() {
  console.log("Shutting down...");
  clearInterval(interval);
  await telegramClient.disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
