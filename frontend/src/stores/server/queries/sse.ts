import { StreamLostError } from "../../../platform/policy/failurePolicy";

export interface StreamChunk {
  channel: string;
  data: unknown;
}

export const MAX_SSE_FRAME_BYTES = 2 * 1024 * 1024;
export const MAX_SSE_INCOMPLETE_BYTES = MAX_SSE_FRAME_BYTES;
const SSE_DECODE_SLICE_BYTES = 64 * 1024;

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const low = value.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else bytes += 3;
  }
  return bytes;
}

export function parseSseFrames(buffer: string): {
  frames: StreamChunk[];
  rest: string;
} {
  const frames: StreamChunk[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    let channel = "message";
    let data = "";
    let dataBytes = 0;
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) channel = line.slice(6).trim();
      else if (line.startsWith("data:")) {
        const value = line.slice(5).trim();
        dataBytes += utf8ByteLength(value);
        if (dataBytes > MAX_SSE_FRAME_BYTES) break;
        data += value;
      }
    }
    if (data.length === 0 || dataBytes > MAX_SSE_FRAME_BYTES) continue;
    try {
      frames.push({ channel, data: JSON.parse(data) });
    } catch {
      frames.push({ channel, data });
    }
  }
  return { frames, rest };
}

function isAbort(cause: unknown): boolean {
  return cause instanceof Error && cause.name === "AbortError";
}

export async function* sseChunks(
  response: Response,
): AsyncGenerator<StreamChunk, void, unknown> {
  if (!response.ok || !response.body) {
    throw new StreamLostError(`graph stream responded ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let bufferedWireBytes = 0;
  let delimiterSearchFrom = 0;
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (cause) {
        if (isAbort(cause)) throw cause;
        throw new StreamLostError("graph stream dropped");
      }
      if (chunk.done) throw new StreamLostError("graph stream ended");
      for (let offset = 0; offset < chunk.value.byteLength; ) {
        const end = Math.min(chunk.value.byteLength, offset + SSE_DECODE_SLICE_BYTES);
        buffer += decoder.decode(chunk.value.subarray(offset, end), { stream: true });
        bufferedWireBytes += end - offset;
        offset = end;
        if (bufferedWireBytes > MAX_SSE_INCOMPLETE_BYTES) {
          throw new StreamLostError("graph stream frame exceeds byte ceiling");
        }
        if (buffer.indexOf("\n\n", delimiterSearchFrom) < 0) {
          delimiterSearchFrom = Math.max(0, buffer.length - 1);
          continue;
        }
        const { frames, rest } = parseSseFrames(buffer);
        buffer = rest;
        bufferedWireBytes = utf8ByteLength(rest);
        delimiterSearchFrom = 0;
        for (const frame of frames) yield frame;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
