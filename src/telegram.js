import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";

const SPOTIFY_TRACK_URL_RE = /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/;

export async function createTelegramClient({ apiId, apiHash, dataDir }) {
  const sessionPath = join(dataDir, "session.txt");
  if (!existsSync(sessionPath)) {
    throw new Error(
      `No Telegram session found at ${sessionPath}. Run "npm run login" once first.`
    );
  }

  const sessionString = readFileSync(sessionPath, "utf8").trim();
  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.connect();

  const authorized = await client.checkAuthorization();
  if (!authorized) {
    throw new Error(
      `Telegram session at ${sessionPath} is no longer valid. Delete it and run "npm run login" again.`
    );
  }

  return client;
}

export async function sendToDeezload(client, username, spotifyUrl) {
  await client.sendMessage(username, { message: spotifyUrl });
}

/**
 * Listens for ANY outgoing message to Deezload — not just ones this app sent —
 * so a manually copy-pasted Spotify link (e.g. sent while the Spotify API is
 * rate-limited, or forwarded from a direct DM to the DJ) still gets picked up.
 * The userbot is logged in as a real personal account, so GramJS sees every
 * message that account sends, regardless of who/what triggered it.
 */
export function watchOutgoingDeezloadMessages(client, username, onSpotifyTrackId) {
  client.addEventHandler(async (event) => {
    const text = event.message?.text;
    if (!text) return;
    const match = text.match(SPOTIFY_TRACK_URL_RE);
    if (!match) return;
    await onSpotifyTrackId(match[1]);
  }, new NewMessage({ outgoing: true, chats: [username] }));
}
