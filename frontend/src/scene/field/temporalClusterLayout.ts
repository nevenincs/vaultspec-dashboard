import {
  compareStableIdentifiers,
  stableIdentifier,
} from "../../platform/localization/displayText";

const DAY_MS = 24 * 60 * 60 * 1000;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export interface TemporalClusterInput {
  id: string;
  tMs: number;
  x: number;
  lane?: "design" | "execution";
}

export interface TemporalClusterOptions {
  height: number;
  pointRadius?: number;
  spacing?: number;
}

export interface TemporalBucketMeta {
  key: string;
  count: number;
  x: number;
  y: number;
  radius: number;
  ids: string[];
}

export interface TemporalClusterLayoutResult {
  positions: Map<string, { x: number; y: number }>;
  buckets: TemporalBucketMeta[];
}

function dayKey(tMs: number): string {
  return new Date(Math.floor(tMs / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
}

function laneBias(lane: TemporalClusterInput["lane"], height: number): number {
  if (lane === "design") return -height * 0.16;
  if (lane === "execution") return height * 0.16;
  return 0;
}

export function temporalClusterLayout(
  inputs: readonly TemporalClusterInput[],
  options: TemporalClusterOptions,
): TemporalClusterLayoutResult {
  const pointRadius = options.pointRadius ?? 8;
  const spacing = options.spacing ?? pointRadius * 2.4;
  const height = Math.max(1, options.height);
  const axisY = height / 2;
  const buckets = new Map<string, TemporalClusterInput[]>();

  for (const input of inputs) {
    if (!Number.isFinite(input.tMs) || !Number.isFinite(input.x)) continue;
    const key = dayKey(input.tMs);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(input);
    else buckets.set(key, [input]);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const meta: TemporalBucketMeta[] = [];

  for (const [key, bucket] of [...buckets.entries()].sort((a, b) =>
    compareStableIdentifiers(stableIdentifier(a[0]), stableIdentifier(b[0])),
  )) {
    const ordered = [...bucket].sort((a, b) =>
      compareStableIdentifiers(stableIdentifier(a.id), stableIdentifier(b.id)),
    );
    const x = ordered.reduce((sum, item) => sum + item.x, 0) / ordered.length;
    let radius = pointRadius;

    ordered.forEach((item, index) => {
      const r = index === 0 ? 0 : spacing * Math.sqrt(index);
      const theta = index * GOLDEN_ANGLE;
      const dx = index === 0 ? 0 : Math.cos(theta) * r;
      const dy = index === 0 ? 0 : Math.sin(theta) * r;
      const y = axisY + laneBias(item.lane, height) + dy;
      positions.set(item.id, { x: x + dx, y });
      radius = Math.max(radius, Math.hypot(dx, laneBias(item.lane, height) + dy));
    });

    meta.push({
      key,
      count: ordered.length,
      x,
      y: axisY,
      radius: radius + pointRadius,
      ids: ordered.map((item) => item.id),
    });
  }

  return { positions, buckets: meta };
}
