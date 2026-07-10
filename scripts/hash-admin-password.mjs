import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";
import { createAdminPasswordRecord } from "../src/lib/admin-session.ts";

async function readPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const interactive = Boolean(process.stdin.isTTY);
  if (interactive) {
    process.stderr.write("Admin password: ");
    spawnSync("stty", ["-echo"], { stdio: ["inherit", "ignore", "ignore"] });
  }
  const input = createInterface({ input: process.stdin, terminal: false });
  try {
    return await new Promise((resolve) => input.once("line", resolve));
  } finally {
    input.close();
    if (interactive) {
      spawnSync("stty", ["echo"], { stdio: ["inherit", "ignore", "ignore"] });
      process.stderr.write("\n");
    }
  }
}

const password = await readPassword();
if (typeof password !== "string" || password.length < 12) {
  process.stderr.write("Password must be at least 12 characters.\n");
  process.exit(1);
}
process.stdout.write(`${await createAdminPasswordRecord(password)}\n`);
