import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { connect } from "node:net";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
console.log("Response local diagnostics (read-only; no credentials printed)");
console.log(`Node ${process.version} · ${process.platform} · ${process.arch}`);
const [major, minor] = process.versions.node.split(".").map(Number);
console.log(
  major > 22 || (major === 22 && minor >= 12)
    ? "Node: supported runtime"
    : "Node: install current Node 24 LTS before continuing",
);
console.log(
  `Project folder: ${process.cwd().length} characters${process.cwd().length > 150 ? " — use a shorter path such as C:\\Projects\\Response if Windows tools fail" : ""}`,
);
const docker = spawnSync("docker", ["info", "--format", "{{.OSType}}"], {
  encoding: "utf8",
  timeout: 10000,
});
console.log(
  docker.status === 0 && docker.stdout.trim() === "linux"
    ? "Docker: Linux engine available"
    : "Docker: unavailable or not using Linux containers; start Docker Desktop",
);
console.log(
  existsSync(".env.demo")
    ? "Local configuration: .env.demo exists"
    : "Local configuration: missing; run npm run setup:demo",
);
for (const port of [5432, 4000, 5173]) {
  const listening = await new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.setTimeout(1500);
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.on("connect", () => finish(true));
    socket.on("error", () => finish(false));
    socket.on("timeout", () => finish(false));
  });
  console.log(
    `Port ${port}: ${listening ? "a process is listening" : "not listening"}`,
  );
}
try {
  const ready = await fetch("http://127.0.0.1:4000/api/v1/health/ready", {
    signal: AbortSignal.timeout(2500),
  });
  console.log(
    `API/database readiness: ${ready.ok ? "ready" : `HTTP ${ready.status}; inspect API logs`}`,
  );
  const config = await fetch("http://127.0.0.1:4000/api/v1/auth/config", {
    signal: AbortSignal.timeout(2500),
  });
  if (config.ok) {
    const body = await config.json();
    console.log(
      `Identity mode: ${body.mode}; real identity configured: ${body.identityConfigured === true ? "yes" : "no"}`,
    );
  }
} catch {
  console.log(
    "API: not reachable at localhost:4000. Start npm run dev:demo and inspect the first error.",
  );
}
console.log(
  "If Vite exits, capture its complete output: npm run dev -w apps/web *> vite-error.txt",
);
