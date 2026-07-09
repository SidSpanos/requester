# requester

Second, parallel intake channel for song requests, alongside the existing QR/webpage
flow in `request_line` (untouched by this project).

An iPad at the venue stays open to Spotify with a playlist. Customers search and add
their song directly in Spotify's own app — no QR code, no app-switching. This service
polls that playlist in the background, and the moment a new track shows up, forwards
its Spotify link to the Deezload bot on Telegram, sent from your own account (Deezload
needs a real user, not a bot, as the sender) — so the download happens with zero manual
copy/paste.

## How it works

- `src/spotify.js` polls the playlist every `POLL_INTERVAL_MS` (default 12s). Reading
  playlist tracks requires a **user-authorized** token — Spotify blocks the plain
  Client Credentials flow for this endpoint even on public playlists — so it's
  authenticated once via `spotify-login.js` (Authorization Code flow, you approve as
  yourself) and refreshed automatically after that using a saved refresh token.
- `src/state.js` snapshots the current track list to `DATA_DIR/state.json` after every
  poll. New tracks = present now but not in the last snapshot. On the very first run
  ever, it just captures a baseline and sends nothing (so it doesn't blast your entire
  existing playlist to Deezload on first boot).
- `src/telegram.js` sends each new track's link to `DEEZLOAD_USERNAME` using a Telegram
  **userbot** (GramJS/MTProto), authenticated once via `telegram-login.js` and
  persisted as a session string.
- `src/server.js` exposes a tiny status endpoint so you can check it's alive from the
  NAS.

## One-time setup

1. **Spotify app** — create one at the
   [developer dashboard](https://developer.spotify.com/dashboard), grab the Client ID
   and Client Secret. Add `http://127.0.0.1:8888/callback` as a Redirect URI (used only
   for the one-time login below — Spotify allows plain `http` for that exact loopback
   address, though it'll insist on `https` for any other placeholder URI).
2. **Playlist** — create it in Spotify (public or private, doesn't matter now that
   we're using user-authorized auth), open it, "Share" → "Copy link", and pull the ID
   out of `open.spotify.com/playlist/<PLAYLIST_ID>`.
3. **Telegram API credentials** — go to <https://my.telegram.org> → API development
   tools → create an app → note the `api_id` and `api_hash`.
4. **Deezload username** — the Telegram `@username` (no `@`) of the Deezload bot you
   already forward links to manually today.
5. Copy `.env.example` to `.env` and fill in all of the above.
6. **Log in once** (do this on your PC/laptop, not inside a headless Docker container):

   ```
   npm install
   npm run spotify-login    # Spotify: opens a URL, you approve as yourself in a browser

   # Telegram, run as separate steps (no live terminal prompt needed):
   node telegram-login.js phone "+46736768430"
   node telegram-login.js code "12345"                 # code Telegram just sent you
   node telegram-login.js password "your2FApassword"   # only if that account has 2FA enabled
   ```

   These write `data/session.txt` and `data/spotify_refresh_token.txt`. The whole
   `data/` folder is what you copy to the NAS — the container itself never needs
   interactive login.

## Running on the NAS (Docker)

Copy the project folder (including the `data/` folder from step 6) to the NAS, then:

```
docker compose up -d --build
```

- Kiosk display: `http://<nas-ip>:8787/` (or `/board`, same thing) — this is the
  default now so the board is what loads if you just visit the domain.
- Status: `curl http://<nas-ip>:8787/status` — shows last poll time, last track
  forwarded, and any last error.
- Liveness check: `GET /health` → `200 ok`.
- Logs: `docker compose logs -f requester`.

The `./data` folder is bind-mounted into the container so `session.txt`,
`spotify_refresh_token.txt`, and `state.json` survive restarts and rebuilds. **Don't
delete `data/` on the NAS** — that logs you out of both Telegram and Spotify, and
forgets which tracks were already seen (a reset would re-forward the whole playlist to
Deezload).

### Per-event heading/tagline

Drop a `data/event.txt` file on the NAS (line 1 = heading, line 2 = tagline) to show a
title on the board, e.g.:

```
Caroline & Jose Wedding
Request your favourite song!
```

Edit it directly on the NAS for each event — no redeploy needed, the board picks it up
within 30s. No file = no heading shown.

Note: `docker-compose.yml` deliberately pins `DATA_DIR=/data` in `environment:`, which
overrides whatever `.env` says (docker-compose's `environment:` wins over `env_file:`).
That's what makes the bind mount line up — don't remove it.

## If a session ever breaks

- **Telegram**: delete `data/session.txt` and `data/telegram_login_state.json` (if
  present), run the `telegram-login.js` steps above again locally, copy the new
  `session.txt` back to the NAS's `data/` folder.
- **Spotify**: delete `data/spotify_refresh_token.txt`, run `npm run spotify-login`
  again locally, copy the new file back to the NAS's `data/` folder.

## Local dev (without Docker)

```
npm install
npm run spotify-login                          # first time only
node telegram-login.js phone "+46736768430"    # first time only
node telegram-login.js code "12345"            # first time only
npm start
```
