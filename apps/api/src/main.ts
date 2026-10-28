import { createServer } from "node:http";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";

const config = readConfig(process.env);
const server = createServer({ maxHeaderSize: 16 * 1024 }, createApp(config));
server.requestTimeout = 30_000;
server.headersTimeout = 20_000;
server.listen(config.port);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close();
    setTimeout(() => server.closeAllConnections(), 5000).unref();
  });
}
