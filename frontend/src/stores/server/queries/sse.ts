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

export type SseResponseAcquirer = (signal: AbortSignal) => Promise<Response>;

/**
 * Open and consume an SSE response without letting an owner's post-header abort
 * destroy the resolved transport. The private request signal follows the owner
 * only while response headers are pending; once acquired, {@link sseChunks}
 * owns cancellation through the response reader.
 */
export async function* acquireSseChunks(
  acquire: SseResponseAcquirer,
  ownerSignal: AbortSignal,
): AsyncGenerator<StreamChunk, void, unknown> {
  if (ownerSignal.aborted) return;

  const requestController = new AbortController();
  let acquiring = true;
  const abortRequest = () => {
    if (acquiring) requestController.abort(ownerSignal.reason);
  };
  ownerSignal.addEventListener("abort", abortRequest, { once: true });

  try {
    let response: Response;
    try {
      response = await acquire(requestController.signal).then(
        (settled) => {
          acquiring = false;
          ownerSignal.removeEventListener("abort", abortRequest);
          return settled;
        },
        (cause: unknown) => {
          acquiring = false;
          ownerSignal.removeEventListener("abort", abortRequest);
          throw cause;
        },
      );
    } catch (cause) {
      if (ownerSignal.aborted && requestController.signal.aborted) {
        return;
      }
      throw cause;
    }

    yield* sseChunks(response, ownerSignal);
  } finally {
    acquiring = false;
    ownerSignal.removeEventListener("abort", abortRequest);
  }
}

export async function* sseChunks(
  response: Response,
  ownerSignal?: AbortSignal,
): AsyncGenerator<StreamChunk, void, unknown> {
  if (!response.ok || !response.body) {
    throw new StreamLostError(`graph stream responded ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let bufferedWireBytes = 0;
  let delimiterSearchFrom = 0;
  let failed = false;
  let cancellation: Promise<{ cause?: unknown }> | null = null;
  const cancelReader = () => {
    if (cancellation !== null) return;
    cancellation = reader.cancel().then(
      () => ({}),
      (cause: unknown) => ({ cause }),
    );
  };
  const finishReader = async () => {
    if (cancellation !== null) {
      const outcome = await cancellation;
      if (outcome.cause !== undefined) throw outcome.cause;
    } else if (!failed) {
      await reader.cancel();
    }
  };
  ownerSignal?.addEventListener("abort", cancelReader, { once: true });
  if (ownerSignal?.aborted) cancelReader();
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        if (cancellation !== null) {
          await finishReader();
          return;
        }
        failed = true;
        throw new StreamLostError("graph stream dropped");
      }
      if (cancellation !== null) {
        await finishReader();
        return;
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
        for (const frame of frames) {
          if (cancellation !== null) {
            await finishReader();
            return;
          }
          yield frame;
        }
      }
    }
  } finally {
    ownerSignal?.removeEventListener("abort", cancelReader);
    await finishReader();
  }
}
