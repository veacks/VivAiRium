import { spawn } from "node:child_process";

const processes = [];
let shuttingDown = false;
const functionsPort = process.env.VIVAIRIUM_FUNCTIONS_PORT ?? "9999";

function startProcess(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    console.error(`[dev:local] ${name} exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    shutdown(code ?? 1);
  });

  processes.push({ name, child });
  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  for (const { child } of processes) {
    if (!child.killed) {
      child.kill("SIGINT");
    }
  }

  setTimeout(() => {
    for (const { child } of processes) {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    }
  }, 1500);

  setTimeout(() => process.exit(exitCode), 2500);
}

async function waitForUrl(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return true;
      }
    } catch {
      // Retry until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.error("[dev:local] starting netlify local dev");
startProcess(
  "functions",
  "npx",
  ["netlify-cli", "functions:serve", "--offline", "--filter", "@aquarium/functions", "--port", functionsPort],
  { cwd: process.cwd() },
);

console.error("[dev:local] starting web dev server");
startProcess("web", "pnpm", ["-C", "apps/web", "dev"], {
  cwd: process.cwd(),
  env: {
    VITE_FUNCTIONS_ORIGIN: `http://localhost:${functionsPort}`,
  },
});

waitForUrl(`http://localhost:${functionsPort}/.netlify/functions/patch-feed`, 30000).then((ready) => {
  if (shuttingDown) {
    return;
  }
  if (!ready) {
    console.error("[dev:local] functions server did not become ready within 30s");
    shutdown(1);
    return;
  }
  console.error("[dev:local] starting orchestrator");
  startProcess("orchestrator", "pnpm", ["orchestrator:run"], {
    cwd: process.cwd(),
    env: {
      VIVAIRIUM_PATCH_WEBHOOK_URL: `http://localhost:${functionsPort}/.netlify/functions/patch-webhook`,
    },
  });
});
