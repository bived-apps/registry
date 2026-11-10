// Bounded reader for a Fetch Request body: enforces the registry's 8,192-byte
// limit while streaming, instead of buffering an arbitrarily large body first.
const DEFAULT_LIMIT = 8192;

export class ReportBodyTooLargeError extends Error {
  constructor(message = "report body too large", options) {
    super(message, options);
    this.name = "ReportBodyTooLargeError";
  }
}

async function readReportBody(input, limit = DEFAULT_LIMIT) {
  const stream =
    input && typeof input.getReader === "function"
      ? input
      : input && input.body && typeof input.body.getReader === "function"
        ? input.body
        : null;
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      if (total > limit) {
        let cancelError = null;
        try {
          await reader.cancel();
        } catch (err) {
          cancelError = err;
          console.error("report-body: failed to cancel oversized body reader:", err);
        }
        throw new ReportBodyTooLargeError("report body too large",
          cancelError ? { cause: cancelError } : undefined);
      }
      chunks.push(chunk);
    }
  } catch (err) {
    if (err instanceof ReportBodyTooLargeError) throw err;
    let cancelError = null;
    try {
      await reader.cancel();
    } catch (cancelErr) {
      cancelError = cancelErr;
      console.error("report-body: failed to cancel body reader:", cancelErr);
    }
    if (cancelError) {
      // Preserve the cancellation failure alongside the original read failure.
      err.cause = err.cause ?? cancelError;
    }
    throw err;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return new TextDecoder().decode(out);
}

export { readReportBody };
export default readReportBody;