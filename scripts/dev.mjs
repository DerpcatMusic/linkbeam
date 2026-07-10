if (globalThis.Bun) {
  const child = Bun.spawn(["node", import.meta.filename], {
    cwd: process.cwd(),
    env: process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(await child.exited);
}

const { dev } = await import("astro");

const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "4321", 10);
const server = await dev({ host, port });

console.log(`Local server ready at http://${host}:${server.address.port}`);

let stopping = false;
async function stop(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`\n${signal}: stopping local server`);
  await server.stop();
  process.exit(0);
}

process.on("SIGINT", () => void stop("SIGINT"));
process.on("SIGTERM", () => void stop("SIGTERM"));
