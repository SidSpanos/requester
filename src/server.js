import { createServer } from "node:http";

export function createStatusServer(port, getStatus) {
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getStatus(), null, 2));
  });

  server.listen(port, () => {
    console.log(`Status endpoint listening on :${port} (GET / for status, /health for a liveness check)`);
  });

  return server;
}
