# Multi-tenant vision (future project — not started)

Notes from a planning conversation, kept here so they carry over cleanly when this
becomes its own project. The current `requester` codebase (built for the Caroline &
Jose wedding) is the working single-tenant prototype/proof of concept this would grow
from — barebones to reuse, not rewrite from scratch.

## The core idea

"A marriage between Spotify and Telegram" — a request board product for DJs, not just
a personal tool for one wedding.

- **Spotify**: guests search and add songs on their own device/the venue iPad, using
  Spotify's own app — zero friction, no signup, no app install. Backend polls the
  playlist to detect adds.
- **Telegram**: the resilient fallback channel. When Spotify's API is rate-limited
  (a real risk — we hit a 17-hour lockout during our own testing), guests scan a QR
  that opens a Telegram group and post their request there manually. No userbot
  required for this — it's just a link to a group the DJ already has.
- **The board**: live display of what's been requested and what's already been played
  (DJ marks tracks played manually), plus the branding/monetization layer already
  built — Book Me QR, Tip via Swish QR, event title/tagline, hero video or image in
  two sizes.

## The value proposition

Frictionless for guests (scan-and-use, nothing to install or sign up for), polished
and revenue-adjacent for the DJ (booking + tipping QRs sit right there on a screen
that's also functioning as ambient branding at the event). Customization (title,
tagline, hero media) matters because DJs work weddings, corporate events, club
nights — a screen that can't be made to feel like *their* event isn't something
they'd put on display for clients.

## What's explicitly OUT of the multi-tenant product

**Deezload auto-forwarding stays personal, single-user, this account only.** It is
not to be built into the multi-tenant product, not even as a hidden/unmarketed
feature. The reasoning: keeping it quiet for one person's own workflow is one thing;
building it into infrastructure offered to other DJs — even hidden — means knowingly
providing unauthorized-download infrastructure to other users at scale. That's a
meaningfully bigger step than a personal shortcut, and it's a line not to cross.

## Architecture sketch

- Google sign-up for DJ accounts.
- Per-DJ Spotify OAuth ("Login with Spotify"). **Each DJ should connect their own
  Spotify Developer app** (own client_id/secret), not share one platform-wide app —
  keeps rate-limit buckets isolated per DJ instead of one DJ's busy night throttling
  everyone. This is the same one-time Spotify Developer Dashboard step done for the
  prototype.
- Per-DJ settings page: playlist ID, event heading/tagline, logo video/image upload,
  QR links (booking, tipping, fallback group).
- Unique URL per DJ: `https://requestline.qzz.io/<username>`.
- Real database instead of flat JSON files in a bind-mounted folder — needed for
  proper per-tenant data isolation.
- Telegram's role for the core product is just a QR link to a DJ-provided group — no
  userbot, no stored personal-account session tokens, no trust/liability exposure
  from holding other people's live Telegram credentials.

## Longer-term, not a launch blocker

Spotify has an **Extended Quota Mode** review process for apps that outgrow default
rate limits. Worth applying for once there's real usage to point to — "this drives
genuine engagement with people's Spotify libraries at live events" is a strong,
honest pitch to make to Spotify. Not needed to launch; a growth milestone once the
per-DJ-app workaround starts to strain.

## Status

Documented only. No multi-tenant work has started. The current project stays focused
on the single-tenant wedding deployment until this is picked back up.
