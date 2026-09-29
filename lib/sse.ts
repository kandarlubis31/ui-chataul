/**
 * Incremental SSE (Server-Sent Events) line parser.
 *
 * Network chunks do NOT align with SSE event boundaries — a `data:` line can be
 * split across two TCP chunks. Naive per-chunk splitting silently drops partial
 * JSON. This parser buffers the trailing partial line until the next chunk
 * completes it.
 */
export function createSSEParser(onData: (data: string) => void) {
  let buffer = "";

  const processLine = (line: string) => {
    const trimmed = line.replace(/\r$/, "");
    if (trimmed.startsWith("data:")) {
      // "data: {...}" or "data:{...}" — strip prefix and single leading space
      onData(trimmed.slice(5).replace(/^ /, ""));
    }
  };

  return {
    /** Feed a decoded text chunk into the parser. */
    push(chunk: string) {
      buffer += chunk;
      const lines = buffer.split("\n");
      // Keep the last (possibly incomplete) line buffered until more arrives
      buffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    },
    /** Call when the stream ends to process any remaining buffered line. */
    flush() {
      if (buffer) {
        processLine(buffer);
        buffer = "";
      }
    },
  };
}
