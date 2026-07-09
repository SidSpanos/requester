// One-time interactive Spotify login (Authorization Code flow). Run this locally in a
// browser-accessible environment — not meant for a headless Docker container.
//
//   npm run spotify-login
//
// Opens a tiny local server on 127.0.0.1:8888, prints an authorize URL for you to visit
// and approve as yourself, then exchanges the returned code for a refresh token and
// saves it to DATA_DIR/spotify_refresh_token.txt (same pattern as the Telegram
// session file) so it persists correctly across Docker restarts/rebuilds.

import "dotenv/config";
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { saveRefreshToken } from "./src/spotify.js";

const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, DATA_DIR = "./data" } = process.env;
const PORT = 8888;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = "playlist-read-private playlist-read-collaborative";

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.error("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env first.");
  process.exit(1);
}

const authUrl = new URL("https://accounts.spotify.com/authorize");
authUrl.searchParams.set("client_id", SPOTIFY_CLIENT_ID);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("scope", SCOPES);

console.log("\nOpen this URL in a browser and log in as yourself, then approve access:\n");
console.log(authUrl.toString());
console.log(`\nWaiting for the redirect back to ${REDIRECT_URI} ...\n`);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end(`Spotify returned an error: ${error}`);
    console.error(`Spotify returned an error: ${error}`);
    server.close();
    process.exit(1);
  }

  try {
    const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
    }

    const data = await tokenRes.json();

    mkdirSync(DATA_DIR, { recursive: true });
    saveRefreshToken(DATA_DIR, data.refresh_token);

    res.writeHead(200, { "Content-Type": "text/plain" }).end("Logged in! You can close this tab and return to the terminal.");
    console.log(`Success — refresh token saved to ${DATA_DIR}/spotify_refresh_token.txt`);
    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" }).end(err.message);
    console.error(err.message);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT);
