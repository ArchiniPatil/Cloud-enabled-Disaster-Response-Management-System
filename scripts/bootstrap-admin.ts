import { bootstrapAdmin } from "./admin-bootstrap.js";
import { pool } from "../apps/api/src/db.js";
await bootstrapAdmin(process.argv[2]);
console.log(
  "Initial administrator provisioned. No public bootstrap endpoint exists.",
);
await pool.end();
