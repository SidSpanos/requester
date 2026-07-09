import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const logoPath = join(publicDir, "logo.webp");

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
  .header {
    display: flex; align-items: center; justify-content: center;
    padding: 24px 0 12px;
  }
  .header img { height: 9vh; max-height: 90px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    grid-auto-rows: min-content;
    align-items: start;
    gap: 20px;
    padding: 10px 32px 32px;
    height: calc(100vh - 130px);
    overflow: hidden;
  }
  .card {
    background: #16161f;
    border-radius: 16px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: enter 0.5s ease-out;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }
  .card img {
    width: 100%;
    aspect-ratio: 1 / 1;
    object-fit: cover;
    display: block;
    background: #222;
  }
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
  @keyframes enter {
    from { opacity: 0; transform: translateY(16px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
</style>
</head>
<body>
  <div class="header"><img id="logo" src="/logo.webp" alt="logo"></div>
  <div id="grid" class="grid"><div class="empty">Waiting for the first request&hellip;</div></div>
<script>
  const MAX_SHOWN = 24;
  let lastSignature = "";

  async function refresh() {
    try {
      const res = await fetch("/requests");
      const requests = await res.json();
      const shown = requests.slice(0, MAX_SHOWN);
      const signature = shown.map(r => r.uri).join(",");
      if (signature === lastSignature) return;
      lastSignature = signature;

      const grid = document.getElementById("grid");
      if (shown.length === 0) {
        grid.innerHTML = '<div class="empty">Waiting for the first request&hellip;</div>';
        return;
      }
      grid.innerHTML = shown.map(r => \`
        <div class="card">
          <img src="\${r.imageUrl || ''}" alt="" onerror="this.style.visibility='hidden'">
          <div class="info">
            <div class="name">\${escapeHtml(r.name)}</div>
            <div class="artist">\${escapeHtml(r.artists)}</div>
          </div>
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

  refresh();
  setInterval(refresh, 5000);

  // Hidden reset: click the logo 3 times within 1.5s to clear the board display.
  // Does not touch the Spotify playlist or the Telegram-forwarding dedup state.
  let clickTimes = [];
  document.getElementById("logo").addEventListener("click", async () => {
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

export function createHttpServer(port, { getStatus, getRequests, clearRequests }) {
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

    if (url.pathname === "/requests") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(getRequests()));
      return;
    }

    if (url.pathname === "/board") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(BOARD_HTML);
      return;
    }

    if (url.pathname === "/logo.webp" && existsSync(logoPath)) {
      res.writeHead(200, { "Content-Type": "image/webp" });
      res.end(readFileSync(logoPath));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getStatus(), null, 2));
  });

  server.listen(port, () => {
    console.log(
      `HTTP server listening on :${port} — / status, /board kiosk display, /requests JSON, /health liveness`
    );
  });

  return server;
}
