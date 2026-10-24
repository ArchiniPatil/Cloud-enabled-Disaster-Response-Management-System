import { migrate } from "./migrations.js";
import { pool } from "../apps/api/src/db.js";
await migrate();
await pool.end();
