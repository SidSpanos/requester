import { createServer } from "node:http";
import { existsSync, createReadStream, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const logoWebpPath = join(publicDir, "logo.webp");
const logoMp4Path = join(publicDir, "logo.mp4");
const logoGifPath = join(publicDir, "logo.gif");
const bookQrPath = join(publicDir, "bookme.png");
const swishQrPath = join(publicDir, "swishme.png");

const BOARD_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Song Requests</title>
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; height: 100%;
    background: #0b0b12;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    overflow: hidden;
  }
  body { display: flex; flex-direction: column; }
  .header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(20px, 5vw, 64px);
    padding: 18px 24px 0;
  }
  .logo-wrap { display: inline-flex; }
  .header video, .header img#logoGif { height: 16vh; max-height: 160px; border-radius: 10px; }
  .header-spacer { flex: 0 0 auto; height: 5vh; }
  .stats {
    flex: 0 0 auto;
    text-align: center;
    color: #9a9aa8;
    font-size: 0.95rem;
    padding-bottom: 6px;
  }
  .qr-side {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .qr-img, .qr-placeholder {
    width: 84px;
    height: 84px;
    border-radius: 10px;
    background: #fff;
    object-fit: contain;
  }
  .qr-placeholder {
    display: none;
    align-items: center;
    justify-content: center;
    color: #111;
    font-size: 0.65rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-align: center;
  }
  .tip-label {
    font-size: 0.8rem;
    color: #9a9aa8;
    font-weight: 600;
  }
  .grid-spacer { flex: 0 0 auto; height: 10vh; }
  .grid {
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    grid-auto-rows: min-content;
    align-items: start;
    gap: 20px;
    padding: 0 32px 16px;
    overflow: hidden;
  }
  .card {
    position: relative;
    background: #16161f;
    border-radius: 16px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: enter 0.5s ease-out;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }
  .art { position: relative; }
  .card img {
    width: 100%;
    aspect-ratio: 1 / 1;
    object-fit: cover;
    display: block;
    background: #222;
  }
  .mark-played {
    position: absolute;
    right: 6px;
    bottom: 6px;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(0,0,0,0.6);
    border: 2px solid rgba(255,255,255,0.4);
    color: #fff;
    font-size: 20px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    z-index: 2;
  }
  .mark-played:active { background: rgba(30,215,96,0.9); transform: scale(0.94); }
  .card .info { padding: 12px 14px; }
  .card .name {
    font-size: 1.05rem;
    font-weight: 700;
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card .artist {
    font-size: 0.85rem;
    color: #9a9aa8;
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .empty {
    text-align: center;
    color: #6a6a78;
    font-size: 1.4rem;
    margin-top: 15vh;
  }
  .played-section {
    flex: 0 0 auto;
    border-top: 1px solid rgba(255,255,255,0.08);
    padding: 10px 32px 18px;
  }
  .played-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6a6a78;
    margin-bottom: 8px;
  }
  .played-strip {
    display: flex;
    overflow-x: auto;
    padding: 6px 4px;
  }
  .played-card {
    position: relative;
    flex: 0 0 auto;
    width: 120px;
    height: 120px;
    border-radius: 14px;
    overflow: hidden;
    margin-left: -24px;
    border: 2px solid #0b0b12;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  }
  .played-card:first-child { margin-left: 0; }
  .played-card img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .played-card .caption {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    padding: 16px 8px 6px;
    background: linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0));
    font-size: 0.75rem;
    font-weight: 700;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  @keyframes enter {
    from { opacity: 0; transform: translateY(16px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="qr-side">
      <img class="qr-img" id="bookQrImg" src="/bookme.png" alt="Book me"
           onerror="this.style.display='none'; document.getElementById('bookQrPlaceholder').style.display='flex';">
      <div class="qr-placeholder" id="bookQrPlaceholder">QR CODE</div>
      <div class="tip-label">Book Me</div>
    </div>
    <div id="logoWrap" class="logo-wrap">
      <video id="logo" autoplay loop muted playsinline webkit-playsinline disableRemotePlayback controlsList="nodownload nofullscreen noremoteplayback" src="/logo.mp4"></video>
      <img id="logoGif" src="/logo.gif" alt="logo" style="display:none;">
    </div>
    <div class="qr-side">
      <img class="qr-img" id="swishQrImg" src="/swishme.png" alt="Swish"
           onerror="this.style.display='none'; document.getElementById('swishQrPlaceholder').style.display='flex';">
      <div class="qr-placeholder" id="swishQrPlaceholder">QR CODE</div>
      <div class="tip-label">Tip via Swish</div>
    </div>
  </div>
  <div class="header-spacer"></div>
  <div class="stats" id="stats"></div>
  <div class="grid-spacer"></div>
  <div id="grid" class="grid"><div class="empty">Waiting for the first request&hellip;</div></div>
  <div class="played-section">
    <div class="played-label">Already played</div>
    <div id="playedStrip" class="played-strip"></div>
  </div>
<script>
  const MAX_SHOWN = 24;
  const MAX_PLAYED_SHOWN = 60;
  let lastSignature = "";

  async function refresh() {
    try {
      const res = await fetch("/requests");
      const all = await res.json();
      // "all" is newest-first (each new request is prepended). The pending queue
      // should read like a real queue: first-requested shown first (top-left),
      // so reverse to oldest-first before capping to the oldest N.
      const pending = all.filter(r => !r.played).reverse();
      const played = all.filter(r => r.played);

      const shown = pending.slice(0, MAX_SHOWN);
      const shownPlayed = played.slice(0, MAX_PLAYED_SHOWN);
      const signature = shown.map(r => r.uri).join(",") + "|" + shownPlayed.map(r => r.uri).join(",");
      if (signature === lastSignature) return;
      lastSignature = signature;

      // TODO: wire up a real tip count once the Swish integration exists.
      const dummyTipCount = 0;
      document.getElementById("stats").textContent =
        all.length + " requested · " + played.length + " played · " + dummyTipCount + " tips";

      const grid = document.getElementById("grid");
      grid.innerHTML = shown.length === 0
        ? '<div class="empty">Waiting for the first request&hellip;</div>'
        : shown.map(r => \`
          <div class="card">
            <div class="art">
              <img src="\${r.imageUrl || ''}" alt="" onerror="this.style.visibility='hidden'">
              <button class="mark-played" data-uri="\${escapeAttr(r.uri)}" title="Mark as played">&#10003;</button>
            </div>
            <div class="info">
              <div class="name">\${escapeHtml(r.name)}</div>
              <div class="artist">\${escapeHtml(r.artists)}</div>
            </div>
          </div>
        \`).join("");

      const strip = document.getElementById("playedStrip");
      strip.innerHTML = shownPlayed.map(r => \`
        <div class="played-card" title="\${escapeAttr(r.name + " — " + r.artists)}">
          <img src="\${r.imageUrl || ''}" alt="">
          <div class="caption">\${escapeHtml(r.name)}</div>
        </div>
      \`).join("");
    } catch (err) {
      // transient fetch failure — just try again on the next tick
    }
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s || "";
    return div.innerHTML;
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  document.getElementById("grid").addEventListener("click", async (e) => {
    const btn = e.target.closest(".mark-played");
    if (!btn) return;
    btn.disabled = true;
    try {
      await fetch("/requests/played", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uri: btn.dataset.uri }),
      });
      await refresh();
    } catch (err) {
      btn.disabled = false;
    }
  });

  refresh();
  setInterval(refresh, 5000);

  // Some kiosk/WebView browsers don't reliably honor the autoplay attribute, or
  // pause the video when their native fullscreen player is tapped — force it to
  // keep playing regardless. If it still can't play inline as intended (errors out,
  // or iOS forces its native fullscreen player despite playsinline), fall back to
  // the animated GIF instead, which never has this problem since it's just an image.
  const logoVideo = document.getElementById("logo");
  const logoGif = document.getElementById("logoGif");
  let usingGifFallback = false;

  function useGifFallback() {
    if (usingGifFallback) return;
    usingGifFallback = true;
    logoVideo.pause();
    logoVideo.style.display = "none";
    logoGif.style.display = "block";
  }

  function keepLogoPlaying() {
    if (usingGifFallback) return;
    const p = logoVideo.play();
    if (p && p.catch) p.catch(() => {});
  }
  keepLogoPlaying();
  logoVideo.addEventListener("pause", keepLogoPlaying);
  logoVideo.addEventListener("error", useGifFallback);
  // Non-standard iOS Safari event — fires exactly when the video is forced into
  // the native fullscreen player despite the playsinline attribute.
  logoVideo.addEventListener("webkitbeginfullscreen", useGifFallback);

  // Hidden reset: click the logo 3 times within 1.5s to clear the board display.
  // Does not touch the Spotify playlist or the Telegram-forwarding dedup state.
  // Bound to the wrapper (not the video itself) so it doesn't fight with the
  // video's own native tap/fullscreen handling on iOS.
  let clickTimes = [];
  document.getElementById("logoWrap").addEventListener("click", async () => {
    const now = Date.now();
    clickTimes = clickTimes.filter(t => now - t < 1500);
    clickTimes.push(now);
    if (clickTimes.length < 3) return;
    clickTimes = [];

    try {
      await fetch("/requests/clear", { method: "POST" });
      await refresh();
    } catch (err) {
      // ignore — worst case the board just doesn't clear, try again
    }
  });
</script>
</body>
</html>`;

// Safari (particularly iOS) requires proper HTTP Range support to play <video>
// reliably — a flat 200-with-full-body response isn't enough, even with
// autoplay/muted/playsinline set. Chrome is lenient and doesn't need this, which is
// why "works on desktop Chrome, silently fails on iPad Safari" is the telltale sign.
function serveFile(req, res, filePath, contentType) {
  if (!existsSync(filePath)) {
    res.writeHead(404).end();
    return;
  }

  const { size } = statSync(filePath);
  const range = req.headers.range;

  if (!range) {
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": size,
      "Accept-Ranges": "bytes",
    });
    createReadStream(filePath).pipe(res);
    return;
  }

  const match = range.match(/bytes=(\d*)-(\d*)/);
  const start = match[1] ? parseInt(match[1], 10) : 0;
  const end = match[2] ? parseInt(match[2], 10) : size - 1;

  res.writeHead(206, {
    "Content-Type": contentType,
    "Content-Length": end - start + 1,
    "Content-Range": `bytes ${start}-${end}/${size}`,
    "Accept-Ranges": "bytes",
  });
  createReadStream(filePath, { start, end }).pipe(res);
}

export function createHttpServer(port, { getStatus, getRequests, clearRequests, markPlayed }) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }

    if (url.pathname === "/requests/clear" && req.method === "POST") {
      clearRequests();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === "/requests/played" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          const { uri } = JSON.parse(body || "{}");
          if (uri) markPlayed(uri);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    if (url.pathname === "/requests") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(getRequests()));
      return;
    }

    if (url.pathname === "/board" || url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(BOARD_HTML);
      return;
    }

    if (url.pathname === "/logo.webp") {
      serveFile(req, res, logoWebpPath, "image/webp");
      return;
    }

    if (url.pathname === "/logo.mp4") {
      serveFile(req, res, logoMp4Path, "video/mp4");
      return;
    }

    if (url.pathname === "/logo.gif") {
      serveFile(req, res, logoGifPath, "image/gif");
      return;
    }

    if (url.pathname === "/bookme.png") {
      serveFile(req, res, bookQrPath, "image/png");
      return;
    }

    if (url.pathname === "/swishme.png") {
      serveFile(req, res, swishQrPath, "image/png");
      return;
    }

    if (url.pathname === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(getStatus(), null, 2));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  server.listen(port, () => {
    console.log(
      `HTTP server listening on :${port} — / and /board show the kiosk display, /status JSON, /requests JSON, /health liveness`
    );
  });

  return server;
}
