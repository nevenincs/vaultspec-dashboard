import { spawnSync, type ChildProcess } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, extname, join, resolve } from "node:path";

/** Resolve a command to a validated absolute executable path without a shell. */
export function resolveExecutable(name: string): string {
  if (resolve(name) === name) {
    accessSync(name, constants.X_OK);
    if (!statSync(name).isFile()) throw new Error(`${name} is not a file`);
    return name;
  }

  const extensions =
    process.platform === "win32" && extname(name) === ""
      ? (process.env["PATHEXT"] ?? ".EXE;.COM")
          .split(";")
          .filter((extension) => extension === ".EXE" || extension === ".COM")
      : [""];
  for (const directory of (process.env["PATH"] ?? "").split(delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = resolve(directory, `${name}${extension.toLowerCase()}`);
      try {
        accessSync(candidate, constants.X_OK);
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // Continue through the bounded PATH/PATHEXT candidate set.
      }
    }
  }
  throw new Error(`executable not found on PATH: ${name}`);
}

/** Wait for a real child process to exit, returning false at the deadline. */
export async function waitForChildExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise<boolean>((resolveExit) => {
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolveExit(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolveExit(true);
    };
    child.once("exit", onExit);
  });
}

/** Force a child tree down through trusted OS entrypoints after graceful timeout. */
export function forceTerminateProcessTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    const systemRoot = process.env["SystemRoot"];
    if (!systemRoot) throw new Error("SystemRoot is unavailable");
    const taskkill = join(systemRoot, "System32", "taskkill.exe");
    accessSync(taskkill, constants.X_OK);
    const result = spawnSync(taskkill, ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "pipe",
      timeout: 5_000,
    });
    if (result.status !== 0) {
      throw new Error(
        `taskkill failed (${result.status}): ${result.stderr?.toString() ?? ""}`,
      );
    }
    return;
  }
  process.kill(-child.pid, "SIGKILL");
}
