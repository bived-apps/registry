import { test } from "node:test"
import assert from "node:assert/strict"
import { readReportBody, ReportBodyTooLargeError } from "../report-body.js"

const LIMIT = 8192

function streamFromBytes(bytes: Uint8Array, chunkSize = 1024): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) {
        controller.enqueue(bytes.subarray(i, Math.min(i + chunkSize, bytes.length)))
      }
      controller.close()
    },
  })
}

function makeRequest(stream: ReadableStream<Uint8Array> | null): Request {
  return new Request("https://example.com/v1/session", { method: "POST", body: stream, duplex: "half" } as any)
}

test("body exactly at the limit succeeds", async () => {
  const bytes = new Uint8Array(LIMIT).fill(0x61) // 'a'
  const text = await readReportBody(makeRequest(streamFromBytes(bytes)))
  assert.equal(text.length, LIMIT)
})

test("one byte over the limit throws ReportBodyTooLargeError", async () => {
  const bytes = new Uint8Array(LIMIT + 1).fill(0x61)
  await assert.rejects(() => readReportBody(makeRequest(streamFromBytes(bytes))), ReportBodyTooLargeError)
})

test("multibyte UTF-8 is counted by bytes", async () => {
  const twoByte = "\u00e9" // 2 bytes in UTF-8
  // exactly at the limit: 4096 two-byte chars = 8192 bytes
  const exact = twoByte.repeat(LIMIT / 2)
  const text = await readReportBody(makeRequest(streamFromBytes(new TextEncoder().encode(exact))))
  assert.equal(new TextEncoder().encode(text).byteLength, LIMIT)
  // one extra char pushes over the byte limit (8194 bytes)
  const over = twoByte.repeat(LIMIT / 2 + 1)
  await assert.rejects(() => readReportBody(makeRequest(streamFromBytes(new TextEncoder().encode(over)))), ReportBodyTooLargeError)
})

test("stream is cancelled as soon as it exceeds the limit", async () => {
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // first chunk within limit
      controller.enqueue(new Uint8Array(LIMIT).fill(0x61))
      // second chunk pushes over
      controller.enqueue(new Uint8Array(10).fill(0x61))
    },
    cancel() { cancelled = true },
  })
  await assert.rejects(() => readReportBody(makeRequest(stream)), ReportBodyTooLargeError)
  // cancellation is async; wait a tick
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(cancelled, true)
})

test("cancellation failure is reported and oversized body still throws", async () => {
  const originalError = console.error
  const messages: any[] = []
  console.error = (...args: any[]) => { messages.push(args) }
  try {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(LIMIT).fill(0x61))
        controller.enqueue(new Uint8Array(10).fill(0x61))
      },
      cancel() { throw new Error("cancel failed") },
    })
    let thrown: any
    try {
      await readReportBody(makeRequest(stream))
    } catch (e) {
      thrown = e
    }
    assert.ok(thrown instanceof ReportBodyTooLargeError)
    assert.ok(thrown.cause instanceof Error)
    assert.equal(thrown.cause.message, "cancel failed")
    assert.ok(messages.length > 0)
  } finally {
    console.error = originalError
  }
})