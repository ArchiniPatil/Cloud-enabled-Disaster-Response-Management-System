import { prepareDatabase } from "./prepare-database.js";
import { bootstrapAdmin } from "./admin-bootstrap.js";
import { z } from "zod";
export async function handler(event: {
  RequestType?: string;
  action?: string;
  username?: string;
}) {
  if (event.action === "bootstrap-admin")
    return bootstrapAdmin(z.string().min(1).max(128).parse(event.username));
  if (event.RequestType === "Delete")
    return { PhysicalResourceId: "response-schema" };
  if (!["Create", "Update"].includes(event.RequestType ?? ""))
    throw new Error("Unsupported administrative operation");
  await prepareDatabase();
  return { PhysicalResourceId: "response-schema" };
}
