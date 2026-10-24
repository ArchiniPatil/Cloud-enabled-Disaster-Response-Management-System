import { tick } from "./jobs.js";
import { pool } from "./db.js";
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopping = true;
  });
while (!stopping) {
  try {
    await tick();
  } catch {
    console.error(JSON.stringify({ event: "worker_tick_failed" }));
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
await pool.end();
