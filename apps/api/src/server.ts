import { app } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";
const server = app.listen(
  config.PORT,
  config.AUTH_MODE === "demo" ? "127.0.0.1" : "0.0.0.0",
  () =>
    console.log(
      JSON.stringify({
        event: "api_started",
        port: config.PORT,
        mode: config.AUTH_MODE,
      }),
    ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
