import type { ServerResponse } from 'node:http'
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib'
import { promisify } from 'node:util'

import type { Plugin } from 'vite'

const compressBrotli = promisify(brotliCompress)
const compressGzip = promisify(gzip)

// Vite appends a base64 data-URL sourcemap to every module it transforms, and
// the dep optimizer bakes one into each prebundled chunk. Measured on this kit:
// 19.04 MB of the 29.27 MB a cold open served. There is no config switch for it
// — `optimizeDeps.rolldownOptions.output.sourcemap` is omitted from the type on
// purpose — so it comes off at the response instead.
const INLINE_JS_SOURCEMAP = /\n?\/\/# sourceMappingURL=data:application\/json[^\n]*/g
const INLINE_CSS_SOURCEMAP = /\n?\/\*# sourceMappingURL=data:application\/json[^*]*\*\/\s*/g

/** Already-compressed payloads: re-compressing them spends CPU to add bytes. */
const COMPRESSIBLE = /javascript|typescript|json|text\/|\+xml|\/xml|wasm/

/**
 * Quality 5, not brotli's default 11: at 11 a cold transform spends seconds per
 * chunk and the link stops being the slow part.
 */
const BROTLI_QUALITY = 5

type Encoding = 'br' | 'gzip' | null

/** Hands the finished bytes to the client. `null` sends them uncompressed. */
type Send = (out: Buffer, encoding: Encoding) => void

function pickEncoding(acceptEncoding: string): Encoding {
  if (acceptEncoding.includes('br')) return 'br'
  if (acceptEncoding.includes('gzip')) return 'gzip'
  return null
}

function withoutInlineSourcemap(body: Buffer, contentType: string): Buffer {
  const pattern = /javascript|typescript/.test(contentType) ? INLINE_JS_SOURCEMAP
    : /text\/css/.test(contentType) ? INLINE_CSS_SOURCEMAP
      : null
  if (!pattern) return body
  const text = body.toString('utf8')
  const stripped = text.replace(pattern, '')
  return stripped.length === text.length ? body : Buffer.from(stripped, 'utf8')
}

function compress(body: Buffer, encoding: Exclude<Encoding, null>): Promise<Buffer> {
  if (encoding === 'gzip') return compressGzip(body, { level: 6 })
  return compressBrotli(body, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
      [zlibConstants.BROTLI_PARAM_SIZE_HINT]: body.length,
    },
  })
}

/**
 * Copy whatever form of header collection `writeHead` was handed onto the
 * response, so `getHeader` keeps working while the flush is deferred.
 *
 * Node accepts three shapes here and connect middlewares use all of them.
 */
function adoptHeaders(res: ServerResponse, headers: unknown): void {
  if (!headers) return
  if (!Array.isArray(headers)) {
    for (const [name, value] of Object.entries(headers as Record<string, number | string | string[]>)) {
      if (value !== undefined) res.setHeader(name, value)
    }
    return
  }
  // Either a flat [k, v, k, v] raw list, or a list of [k, v] pairs.
  if (Array.isArray(headers[0])) {
    for (const [name, value] of headers as [string, number | string | string[]][]) {
      if (value !== undefined) res.setHeader(name, value)
    }
    return
  }
  for (let index = 0; index + 1 < headers.length; index += 1) {
    res.setHeader(String(headers[index]), headers[index + 1] as number | string | string[])
  }
}

function asBuffer(chunk: unknown, encoding: unknown): Buffer | null {
  if (chunk === undefined || chunk === null || typeof chunk === 'function') return null
  if (Buffer.isBuffer(chunk)) return chunk
  return Buffer.from(chunk as string, typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8')
}

/**
 * Hold a response back until its whole body is known, then hand it to `finish`.
 *
 * `writeHead` is deferred along with the body, and that is not optional: a
 * middleware that flushes its headers before streaming would otherwise make the
 * later `setHeader` for `content-encoding` throw ERR_HTTP_HEADERS_SENT and take
 * the dev server down with it. That is what the first version of this file did.
 */
function captureResponse(res: ServerResponse, finish: (body: Buffer, send: Send) => void): void {
  const originalWrite = res.write.bind(res)
  const originalEnd = res.end.bind(res)
  const originalWriteHead = res.writeHead.bind(res)
  const originalFlushHeaders = res.flushHeaders.bind(res)

  const chunks: Buffer[] = []
  let intercepting = true
  let settled = false
  let status: number | undefined
  let statusMessage: string | undefined

  const restore = () => {
    intercepting = false
    res.write = originalWrite
    res.end = originalEnd
    res.writeHead = originalWriteHead
    res.flushHeaders = originalFlushHeaders
  }

  res.writeHead = ((code: number, arg2?: unknown, arg3?: unknown) => {
    if (!intercepting) return originalWriteHead(code, arg2 as never, arg3 as never)
    status = code
    if (typeof arg2 === 'string') { statusMessage = arg2; adoptHeaders(res, arg3) } else adoptHeaders(res, arg2)
    res.statusCode = code
    return res
  }) as typeof res.writeHead

  res.flushHeaders = (() => { if (!intercepting) originalFlushHeaders() }) as typeof res.flushHeaders

  res.write = ((chunk: unknown, encoding?: unknown, callback?: unknown) => {
    if (!intercepting) return originalWrite(chunk as never, encoding as never, callback as never)
    const buffered = asBuffer(chunk, encoding)
    if (buffered) chunks.push(buffered)
    const done = typeof encoding === 'function' ? encoding : callback
    if (typeof done === 'function') (done as () => void)()
    return true
  }) as typeof res.write

  res.end = ((chunk?: unknown, encoding?: unknown, callback?: unknown) => {
    if (!intercepting) return originalEnd(chunk as never, encoding as never, callback as never)
    // A middleware that ends twice must not be turned into a crash by the fact
    // that we buffer.
    if (settled) return res
    settled = true
    const buffered = asBuffer(chunk, encoding)
    if (buffered) chunks.push(buffered)
    const done = [chunk, encoding, callback].find(value => typeof value === 'function') as (() => void) | undefined

    const send: Send = (out, chosen) => {
      restore()
      if (!res.headersSent) {
        if (chosen) { res.setHeader('content-encoding', chosen); res.setHeader('vary', 'accept-encoding') }
        res.setHeader('content-length', String(out.length))
        // The body no longer matches the validator the upstream computed over
        // the original bytes, and a stale 304 would answer with a body the
        // browser never received.
        res.removeHeader('etag')
        if (status !== undefined) {
          if (statusMessage === undefined) originalWriteHead(status)
          else originalWriteHead(status, statusMessage)
        }
      }
      originalEnd(out.length > 0 ? out : undefined, undefined as never, done as never)
    }

    finish(Buffer.concat(chunks), send)
    return res
  }) as typeof res.end
}

export interface DevLeanTransportOptions {
  /** Strip the inline base64 sourcemap comment from JS and CSS responses. */
  stripSourcemaps: boolean
  /** Negotiate brotli/gzip on dev responses. */
  compress: boolean
  /** Below this many bytes a compressed response is not worth the CPU. */
  minCompressBytes?: number
}

/**
 * Makes the dev server survive a long-latency link. See `docs/lean-dev-server.md`.
 *
 * TRANSPORT only: it changes the bytes on the wire, never the module graph and
 * never a transform result the browser would execute differently. HMR, the
 * plugin pipeline and every source file stay exactly as they are.
 */
export function devLeanTransportPlugin(options: DevLeanTransportOptions): Plugin {
  const minCompressBytes = options.minCompressBytes ?? 1024

  return {
    name: 'dev-lean-transport',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      // Registered WITHOUT the returned-callback form, so it lands ahead of
      // Vite's own middlewares — the only position from which a later
      // middleware's response body can still be intercepted.
      server.middlewares.use((req, res, next) => {
        const encoding = options.compress ? pickEncoding(String(req.headers['accept-encoding'] ?? '')) : null
        if (!options.stripSourcemaps && encoding === null) return next()

        captureResponse(res, (body, send) => {
          const contentType = String(res.getHeader('content-type') ?? '')
          // A 204/304 carries no body, an upstream that already chose an
          // encoding owns its bytes, and headers that escaped the deferral
          // leave nothing to correct. All three go back untouched.
          const untouchable = res.statusCode === 204 || res.statusCode === 304
            || res.getHeader('content-encoding') !== undefined || res.headersSent
          if (untouchable) return send(body, null)

          const payload = options.stripSourcemaps ? withoutInlineSourcemap(body, contentType) : body
          if (encoding === null || payload.length < minCompressBytes || !COMPRESSIBLE.test(contentType)) {
            return send(payload, null)
          }
          // Compression is an optimization; failing at it must not cost the
          // response.
          void compress(payload, encoding).then(out => send(out, encoding), () => send(payload, null))
        })

        next()
      })
    },
  }
}
