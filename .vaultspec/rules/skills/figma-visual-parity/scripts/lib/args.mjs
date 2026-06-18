// Tiny, dependency-free CLI argument parser shared by the skill scripts.
// Supports `--key value`, `--key=value`, and boolean `--flag` / `--no-flag`.
export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    let key = token.slice(2);
    if (key.startsWith("no-")) {
      out[key.slice(3)] = false;
      continue;
    }
    const eq = key.indexOf("=");
    if (eq !== -1) {
      out[key.slice(0, eq)] = key.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

export function requireArgs(args, names) {
  const missing = names.filter((n) => args[n] === undefined || args[n] === "");
  if (missing.length) {
    throw new Error(`Missing required argument(s): ${missing.map((n) => `--${n}`).join(", ")}`);
  }
}

export function asInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function asBool(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return !["false", "0", "no", "off"].includes(String(value).toLowerCase());
}
