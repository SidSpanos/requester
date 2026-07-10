Paste everything below into a fresh conversation when you're ready to start the
multi-tenant build.

---

I have a working single-tenant project at a `requester` codebase (a Node.js app,
plain `node:http` server, no framework) — a live song-request board for my own DJ
gigs, currently running for one wedding. It works well and should be treated as the
barebones prototype to build from, not rewritten from scratch. Full design notes are
in `MULTI-TENANT-VISION.md` at that project's repo root — read that first, it has the
complete picture. Short version below.

**What the prototype does today (single-tenant, one DJ — me):**
A kiosk-style webpage (`/board`) shows a live-updating grid of requested songs (album
art, name, artist), a manual "mark as played" button per card that moves it into a
compact played-carousel, live stats ("N requested · M played"), a video or GIF logo
up top with a toggleable "hero mode" (video as full-bleed background), Book Me / Tip
via Swish QR codes, and an event title/tagline pulled from a text file. Currently
requests are detected by polling a shared Spotify playlist (guests add songs via
Spotify's own app on a venue iPad) and forwarding new tracks to a personal download
bot via a Telegram userbot — **that whole mechanism is being replaced**, see below.

**What I want to build now — the multi-tenant version:**
A product other DJs can sign up for and use for their own events, at
`https://requestline.qzz.io/<username>`. Key change from the prototype: **no Spotify
playlist polling at all.** Instead:

- Each DJ creates their own **public Telegram group** for requests, and adds one
  official **Requestline Telegram Bot** (built via BotFather, standard Bot API — NOT
  a userbot/MTProto session) to it during onboarding.
- Guests scan a QR on the board, which opens that DJ's Telegram group, and paste
  their Spotify track link into the chat.
- The bot listens across every DJ's group simultaneously, detects Spotify links in
  new messages, does a lightweight single-track lookup via Spotify Client
  Credentials (app-only auth — confirmed in the prototype this works fine for
  individual track lookups even though it's blocked for playlist-items reads), and
  adds the track to that DJ's board.

This removes the two biggest risks in the original plan: no Spotify rate-limit
exposure (the prototype hit a 17-hour lockout from polling — a real, documented
risk), and no per-DJ Telegram trust problem (a userbot approach would require every
DJ to hand over a session with full access to their personal Telegram account; the
Bot API approach needs none of that).

**Onboarding flow:**
1. Google sign-up.
2. DJ picks a username → gets their page at `/username`.
3. DJ creates their own public Telegram group, adds the Requestline bot, supplies
   the group link.
4. DJ supplies their own Book Me / Tip Me QR codes — **we guide them on how to make
   one, we do not generate QR codes for them.**
5. DJ optionally uploads a small hero video/logo.
6. DJ sets an event title/tagline.
7. **Only one event per user** in v1 — keep the data model simple.

**Explicitly excluded — do not build this in:**
The prototype also has a feature where song requests get auto-forwarded to a
personal download bot via my own Telegram userbot. **That stays personal/single-user
only and must not be part of the multi-tenant product, not even hidden/unmarketed.**
I was explicit about this: it's a way to get tracks downloaded without paying, and
building that into infrastructure offered to other DJs — even quietly — crosses from
"personal shortcut" into "knowingly providing infringement infrastructure to other
users at scale." If this comes up again, re-raise the concern rather than building
it.

**Please help me think through the architecture (auth, database, bot-per-many-groups
routing, per-DJ settings/asset storage) and confirm the plan with me before
implementing** — same approach as last time: discuss and confirm first, then build
incrementally with real verification at each step, not a big-bang implementation.
