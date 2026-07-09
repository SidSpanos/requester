import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const TOKEN_URL = "https://accounts.spotify.com/api/token";

const REFRESH_TOKEN_FILENAME = "spotify_refresh_token.txt";

export function loadRefreshToken(dataDir) {
  const path = join(dataDir, REFRESH_TOKEN_FILENAME);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8").trim();
}

export function saveRefreshToken(dataDir, token) {
  writeFileSync(join(dataDir, REFRESH_TOKEN_FILENAME), token, "utf8");
}

let cachedToken = null;
let cachedTokenExpiresAt = 0;

// Spotify's "Get Playlist Items" endpoint requires a user-authorized token (even for
// public playlists) — Client Credentials alone gets a 403. So we exchange a
// long-lived refresh token (obtained once via spotify-login.js) for a short-lived
// access token on demand. Spotify may rotate the refresh token on each exchange, so
// we return the latest one and the caller persists it.
async function getAccessToken(clientId, clientSecret, refreshToken) {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) {
    return { accessToken: cachedToken, refreshToken };
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error(`Spotify token refresh failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // refresh a bit early to avoid edge-of-expiry 401s
  cachedTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return { accessToken: cachedToken, refreshToken: data.refresh_token || refreshToken };
}

/**
 * Returns the current tracks in the playlist as [{ uri, url, name, artists }], in
 * playlist order. Follows Spotify's cursor pagination. Returns the (possibly rotated)
 * refresh token alongside the tracks so the caller can persist it if it changed.
 */
export async function getPlaylistTracks({ clientId, clientSecret, refreshToken, playlistId }) {
  const { accessToken: token, refreshToken: newRefreshToken } = await getAccessToken(
    clientId,
    clientSecret,
    refreshToken
  );

  // Note: this endpoint's entries nest track data under "item", not "track" — a schema
  // change that came with the /tracks -> /items endpoint migration.
  const fields = "items(item(uri,name,external_urls.spotify,artists(name),album(images))),next";
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/items?fields=${encodeURIComponent(fields)}&limit=100`;

  const tracks = [];
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`Spotify playlist request failed: ${res.status} ${body}`);
      if (res.status === 429) {
        const retryAfterHeader = res.headers.get("retry-after");
        const retryAfterSeconds = retryAfterHeader !== null ? Number(retryAfterHeader) : NaN;
        err.retryAfterMs =
          Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 60_000;
      }
      throw err;
    }

    const data = await res.json();
    for (const entry of data.items) {
      const track = entry.item;
      if (!track || !track.uri) continue; // skip local/removed tracks
      const images = track.album?.images ?? [];
      // Images are typically ordered largest-first (640/300/64px) — pick a mid-size
      // one for the kiosk board rather than the full-res original.
      const image = images.find((img) => img.width && img.width <= 400) ?? images[0];
      tracks.push({
        uri: track.uri,
        url: track.external_urls?.spotify ?? null,
        name: track.name,
        artists: (track.artists ?? []).map((a) => a.name).join(", "),
        imageUrl: image?.url ?? null,
      });
    }
    url = data.next;
  }

  return { tracks, refreshToken: newRefreshToken };
}
