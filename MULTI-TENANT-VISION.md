# Multi-tenant vision (future project — not started)

Notes from a planning conversation, kept here so they carry over cleanly when this
becomes its own project. The current `requester` codebase (built for the Caroline &
Jose wedding) is the working single-tenant prototype/proof of concept this would grow
from — barebones to reuse, not rewrite from scratch. **v2**: refined after realizing
Spotify playlist polling can be dropped entirely — see "What changed" below.

## The core idea

A request board product for DJs, not just a personal tool for one wedding. Guests
never touch Spotify's API at all — they just paste a link into a Telegram group.

- **Telegram is the intake mechanism**, not a fallback. Each DJ creates their own
  **public** Telegram group and adds a single, official **Requestline Telegram Bot**
  (built via BotFather, standard Bot API — not a userbot/MTProto session) to it during
  onboarding. Guests scan a QR on the board, which opens that group, and paste their
  Spotify track link into the chat.
- **The bot** listens across every DJ's group simultaneously (one bot process, many
  groups — standard multi-tenant bot pattern), detects a Spotify track link in a new
  message, does a lightweight single-track lookup (Client Credentials / app-only
  Spotify auth — confirmed this works fine for individual track lookups even though
  it's blocked for playlist-items reads), and adds the track to that DJ's board.
- **The board**: unchanged from the prototype — live grid of requested tracks,
  DJ marks tracks played manually (moves to the played carousel), stats line, event
  title/tagline, Book Me / Tip Me QR codes, hero video-or-image toggle. All of this
  stays exactly as built.

## What changed from v1 of this doc (why it's simpler now)

The original sketch kept Spotify playlist polling as the core mechanic, with Telegram
only as a rate-limit fallback. Moving the whole intake to a Telegram group instead
removes two of the biggest risks/friction points in one move:

- **No more Spotify rate-limit risk.** No playlist polling at all means no chance of
  repeating the 17-hour lockout we hit during prototype testing. The only Spotify API
  usage left is light, one-off single-track lookups — much smaller surface.
- **No more per-DJ Telegram trust problem.** v1 assumed each DJ would need to hand
  over a personal userbot session (full access to their real Telegram account) if
  they wanted any Telegram automation. v2 needs none of that — DJs just add one
  standard, sanctioned bot to their own public group. No personal credentials ever
  touch our servers.
- **No per-DJ Spotify login needed either.** Since there's no playlist to read on the
  DJ's behalf, there's nothing to OAuth into — just our own single Spotify app doing
  Client Credentials track lookups.

## Onboarding flow

1. DJ signs up (Google login).
2. DJ picks a username → gets `https://requestline.qzz.io/<username>`.
3. DJ creates their own **public** Telegram group and adds the Requestline bot to
   it — we guide them through this step by step — and supplies the group link during
   onboarding.
4. DJ supplies their own QR codes (Book Me, Tip Me). **We guide them on how to make
   one** (e.g. pointing at a free QR generator); we don't generate these ourselves.
5. DJ optionally uploads a small hero video/logo.
6. DJ sets their event title/tagline.
7. **Only one event per user** in v1 — no multi-event management, keeps the data
   model simple.

## What's explicitly OUT of the multi-tenant product

**Deezload auto-forwarding stays personal, single-user, this account only.** Not to
be built into the multi-tenant product, not even hidden/unmarketed. Keeping it quiet
for one person's own workflow is one thing; building it into infrastructure offered
to other DJs — even hidden — means knowingly providing unauthorized-download
infrastructure to other users at scale. That's a meaningfully bigger step than a
personal shortcut, and it's a line not to cross.

## The value proposition

Frictionless for guests (scan a QR, paste a link into a chat — nothing to install,
no account), polished and revenue-adjacent for the DJ (booking + tipping QRs sit
right there on a screen that's also ambient branding at the event). Customization
(title, tagline, hero media) matters because DJs work weddings, corporate events,
club nights — a screen that can't be made to feel like *their* event isn't something
they'd put on display for clients.

## Architecture sketch

- Google sign-up for DJ accounts.
- One Requestline Telegram Bot (Bot API), added by each DJ to their own public group;
  bot routes incoming messages to the right DJ by which group they came from.
- One shared Spotify app using Client Credentials for single-track lookups — no
  per-DJ Spotify app or OAuth needed.
- Per-DJ settings page: Telegram group link, event heading/tagline, logo video/image
  upload, QR uploads (booking, tipping).
- Unique URL per DJ: `https://requestline.qzz.io/<username>`.
- Real database instead of flat JSON files in a bind-mounted folder — needed for
  proper per-tenant data isolation.

## Open questions for later

- Exact Bot API integration pattern for listening across many groups at once
  (webhook vs. long-polling) — webhook is probably the right call at any real scale.
- Whether the "briefly limited, scan to request directly" cooldown-QR mechanic from
  the prototype has any role left — likely not, since there's no polling left to be
  rate-limited in the first place. Probably gets dropped entirely in v2.
- Confirm the single-track Spotify lookup endpoint's Client Credentials behavior
  holds up reliably at real volume (worked fine in prototype testing, but that was
  low-volume).

## Status

Documented only, v2 refined design. No multi-tenant work has started. The current
project stays focused on the single-tenant wedding deployment until this is picked
back up.
