import { readFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'

import { MPEGDecoder } from 'mpg123-decoder'
import type { Plugin, ResolvedConfig } from 'vite'

type AudioOptimizeResult = {
  readonly bytes: Uint8Array
  readonly inputBytes: number
  readonly outputBytes: number
  readonly path: string
  readonly wasOptimized: boolean
  readonly wasNormalized: boolean
}

type Mp3EncoderLike = new (
  channels: number,
  sampleRate: number,
  kbps: number,
) => {
  encodeBuffer: (left: Int16Array, right?: Int16Array) => Int8Array | Uint8Array
  flush: () => Int8Array | Uint8Array
}

const AUDIO_MODULE_QUERY = 'audio-optimized'
const AUDIO_OPT_OUT_QUERY = 'audio-optimize'
const AUDIO_SERVE_PREFIX = '/@audio-optimizer/'
const LAME_BUNDLE_PATH = path.resolve('node_modules/lamejs/lame.all.js')
const LONG_TRACK_DURATION_SECONDS = 12
const LONG_TRACK_BITRATE = 96
const SHORT_TRACK_BITRATE = 64
const TARGET_PEAK = 0.97

let mp3EncoderCtorPromise: Promise<Mp3EncoderLike> | null = null

/**
 * Re-encodes project MP3 assets — any `.mp3` under a `src/.../assets/audio/`
 * folder — at build time.
 * Longer tracks (>= 12s) keep stereo at 96 kbps; short SFX collapse to mono at
 * 64 kbps. A two-pass, clip-safe normalization guarantees the compressed peak
 * stays at or below 0.97 without ever boosting quiet audio (no gain > 1.0), so
 * the artistic loudness balance is preserved. Opt a single import out with
 * `?audio-optimize=off`. Works in both `serve` (data/served URL) and `build`
 * (emitted asset). If re-encoding a file would not shrink it and no
 * normalization was needed, the original bytes are kept untouched.
 */
export function audioAssetOptimizerPlugin(): Plugin {
  let config: ResolvedConfig | null = null
  const optimizedAssets = new Map<string, Promise<AudioOptimizeResult>>()
  const reports = new Map<string, AudioOptimizeResult>()
  const serveKeyToFilePath = new Map<string, string>()

  return {
    name: 'audio-asset-optimizer',
    enforce: 'pre',
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = req.url

        if (!requestUrl?.startsWith(AUDIO_SERVE_PREFIX)) {
          next()
          return
        }

        const serveKey = decodeServeKey(requestUrl)
        const filePath = serveKeyToFilePath.get(serveKey)

        if (!filePath) {
          res.statusCode = 404
          res.end('Audio asset not found')
          return
        }

        const result = await getOptimizedAsset(optimizedAssets, reports, filePath)

        res.statusCode = 200
        res.setHeader('Content-Type', 'audio/mpeg')
        res.setHeader('Content-Length', result.bytes.byteLength)
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        res.end(result.bytes)
      })
    },
    async resolveId(source, importer) {
      if (!config || !shouldOptimizeImport(source)) {
        return null
      }

      const resolved = await this.resolve(source, importer, { skipSelf: true })

      if (!resolved || resolved.external) {
        return null
      }

      const filePath = stripQueryAndHash(resolved.id)

      if (!isProjectAudioAsset(filePath, config.root)) {
        return null
      }

      return `${filePath}?${AUDIO_MODULE_QUERY}&bootstrap=deferred`
    },
    async load(id) {
      if (!config || !isOptimizedAudioModuleId(id)) {
        return null
      }

      const filePath = stripQueryAndHash(id)
      const result = await getOptimizedAsset(optimizedAssets, reports, filePath)

      if (config.command === 'serve') {
        const serveKey = toServeKey(filePath, config.root)
        serveKeyToFilePath.set(serveKey, filePath)

        return createUrlModule(createServeUrl(serveKey, result.outputBytes))
      }

      const assetId = this.emitFile({
        name: path.basename(filePath),
        source: result.bytes,
        type: 'asset',
      })

      return `export default import.meta.ROLLUP_FILE_URL_${assetId};`
    },
    closeBundle() {
      if (reports.size === 0) {
        return
      }

      let optimizedCount = 0
      let savedBytes = 0

      for (const result of reports.values()) {
        const action = getReportAction(result)

        if (result.wasOptimized) {
          optimizedCount += 1
          savedBytes += result.inputBytes - result.outputBytes
        }

        console.log(
          `[audio] ${action} ${toRelativePath(result.path)}: ${formatBytes(result.inputBytes)} -> ${formatBytes(result.outputBytes)}`,
        )
      }

      console.log(`[audio] done: ${optimizedCount} optimized, ${formatBytes(savedBytes)} saved`)
    },
  }
}

async function getOptimizedAsset(
  cache: Map<string, Promise<AudioOptimizeResult>>,
  reports: Map<string, AudioOptimizeResult>,
  filePath: string,
): Promise<AudioOptimizeResult> {
  let pendingResult = cache.get(filePath)

  if (!pendingResult) {
    pendingResult = optimizeAudioAsset(filePath)
    cache.set(filePath, pendingResult)
  }

  const result = await pendingResult
  reports.set(filePath, result)
  return result
}

async function optimizeAudioAsset(filePath: string): Promise<AudioOptimizeResult> {
  const inputBytes = await readFile(filePath)
  const inputSize = inputBytes.byteLength

  const decoder = new MPEGDecoder({ enableGapless: true })
  await decoder.ready

  try {
    const decoded = decoder.decode(inputBytes)
    const durationSeconds = decoded.samplesDecoded / decoded.sampleRate
    const sourceChannels = Math.max(1, decoded.channelData.length)
    const targetChannels = sourceChannels > 1 && durationSeconds >= LONG_TRACK_DURATION_SECONDS ? 2 : 1
    const targetBitrate = targetChannels === 2 ? LONG_TRACK_BITRATE : SHORT_TRACK_BITRATE
    const originalPeak = measurePeak(decoded.channelData)

    const targetPeak = Math.min(TARGET_PEAK, originalPeak)
    let initialGain = 1.0

    if (originalPeak > TARGET_PEAK) {
      initialGain = TARGET_PEAK / originalPeak
    }

    const pcmCandidate = scaleChannelData(decoded.channelData, initialGain)
    let encoded = await encodeMp3(pcmCandidate, decoded.sampleRate, targetChannels, targetBitrate)

    // Decode candidate to check for compression-induced clipping / exceeding targetPeak
    let compressedPeak = 0
    const testDecoder = new MPEGDecoder({ enableGapless: true })
    await testDecoder.ready
    try {
      const testDecoded = testDecoder.decode(encoded)
      compressedPeak = measurePeak(testDecoded.channelData)
    } finally {
      testDecoder.free()
    }

    let finalGain = initialGain
    if (compressedPeak > targetPeak && compressedPeak > 0) {
      const correction = targetPeak / compressedPeak
      finalGain = initialGain * correction
      const pcmFinal = scaleChannelData(decoded.channelData, finalGain)
      encoded = await encodeMp3(pcmFinal, decoded.sampleRate, targetChannels, targetBitrate)
    }

    const wasNormalized = Math.abs(finalGain - 1) > 0.0001

    if (encoded.byteLength >= inputSize && !wasNormalized) {
      return {
        bytes: inputBytes,
        inputBytes: inputSize,
        outputBytes: inputSize,
        path: filePath,
        wasNormalized: false,
        wasOptimized: false,
      }
    }

    return {
      bytes: encoded,
      inputBytes: inputSize,
      outputBytes: encoded.byteLength,
      path: filePath,
      wasNormalized,
      wasOptimized: encoded.byteLength < inputSize,
    }
  } finally {
    decoder.free()
  }
}

async function encodeMp3(
  channelData: readonly Float32Array[],
  sampleRate: number,
  targetChannels: 1 | 2,
  kbps: number,
): Promise<Uint8Array> {
  const Mp3Encoder = await getMp3EncoderCtor()
  const encoder = new Mp3Encoder(targetChannels, sampleRate, kbps)
  const mp3Chunks: Uint8Array[] = []
  const blockSize = 1152

  if (targetChannels === 1) {
    const mono = mixToMono(channelData)

    for (let index = 0; index < mono.length; index += blockSize) {
      const mp3buf = encoder.encodeBuffer(toInt16Chunk(mono.subarray(index, index + blockSize)))
      if (mp3buf.length > 0) {
        mp3Chunks.push(toUint8Array(mp3buf))
      }
    }
  } else {
    const { left, right } = mixToStereo(channelData)

    for (let index = 0; index < left.length; index += blockSize) {
      const leftChunk = toInt16Chunk(left.subarray(index, index + blockSize))
      const rightChunk = toInt16Chunk(right.subarray(index, index + blockSize))
      const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk)
      if (mp3buf.length > 0) {
        mp3Chunks.push(toUint8Array(mp3buf))
      }
    }
  }

  const finalChunk = encoder.flush()
  if (finalChunk.length > 0) {
    mp3Chunks.push(toUint8Array(finalChunk))
  }

  return concatUint8Arrays(mp3Chunks)
}

async function getMp3EncoderCtor(): Promise<Mp3EncoderLike> {
  if (!mp3EncoderCtorPromise) {
    mp3EncoderCtorPromise = loadMp3EncoderCtor()
  }

  return mp3EncoderCtorPromise
}

async function loadMp3EncoderCtor(): Promise<Mp3EncoderLike> {
  const bundleSource = await readFile(LAME_BUNDLE_PATH, 'utf8')
  vm.runInThisContext(bundleSource, { filename: LAME_BUNDLE_PATH })

  const lamejs = globalThis as typeof globalThis & {
    readonly lamejs?: { readonly Mp3Encoder?: Mp3EncoderLike }
  }

  if (!lamejs.lamejs?.Mp3Encoder) {
    throw new Error('audio-asset-optimizer: Unable to load lamejs Mp3Encoder bundle')
  }

  return lamejs.lamejs.Mp3Encoder
}

function shouldOptimizeImport(source: string): boolean {
  if (!isMp3Import(source) || shouldBypassAudioOptimization(source)) {
    return false
  }

  return !source.includes(`?${AUDIO_MODULE_QUERY}`)
}

function isMp3Import(source: string): boolean {
  return source.endsWith('.mp3') || source.includes('.mp3?') || source.includes('.mp3#')
}

function isOptimizedAudioModuleId(id: string): boolean {
  return new URLSearchParams(extractQuery(id)).has(AUDIO_MODULE_QUERY)
}

function shouldBypassAudioOptimization(id: string): boolean {
  const value = new URLSearchParams(extractQuery(id)).get(AUDIO_OPT_OUT_QUERY)
  return value === 'off' || value === '0' || value === 'false' || value === 'original'
}

function isProjectAudioAsset(filePath: string, root: string): boolean {
  if (!filePath.endsWith('.mp3')) {
    return false
  }

  const normalizedPath = path.relative(root, filePath).split(path.sep).join('/')
  return !normalizedPath.startsWith('../') && normalizedPath.startsWith('src/') && normalizedPath.includes('/assets/audio/')
}

function createUrlModule(url: string): string {
  return `export default ${JSON.stringify(url)};`
}

function createServeUrl(serveKey: string, version: number): string {
  return `${AUDIO_SERVE_PREFIX}${encodeURIComponent(serveKey)}?v=${version}`
}

function decodeServeKey(requestUrl: string): string {
  const pathname = requestUrl.split('?')[0] ?? ''
  return decodeURIComponent(pathname.slice(AUDIO_SERVE_PREFIX.length))
}

function toServeKey(filePath: string, root: string): string {
  return path.relative(root, filePath).split(path.sep).join('/')
}

function getReportAction(result: AudioOptimizeResult): string {
  if (result.wasOptimized) {
    return result.wasNormalized ? 'optimized+normalized' : 'optimized'
  }

  return result.wasNormalized ? 'normalized' : 'kept'
}

function stripQueryAndHash(id: string): string {
  const hashIndex = id.indexOf('#')
  const queryIndex = id.indexOf('?')
  const boundary = [hashIndex, queryIndex]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0]

  return boundary === undefined ? id : id.slice(0, boundary)
}

function extractQuery(id: string): string {
  const queryIndex = id.indexOf('?')
  if (queryIndex < 0) {
    return ''
  }

  const hashIndex = id.indexOf('#', queryIndex)
  return hashIndex < 0 ? id.slice(queryIndex + 1) : id.slice(queryIndex + 1, hashIndex)
}

function scaleChannelData(channelData: readonly Float32Array[], gain: number): Float32Array[] {
  if (Math.abs(gain - 1) < 0.0001) {
    return channelData.map((channel) => new Float32Array(channel))
  }

  return channelData.map((channel) => {
    const scaled = new Float32Array(channel.length)

    for (let index = 0; index < channel.length; index += 1) {
      scaled[index] = Math.max(-1, Math.min(1, (channel[index] ?? 0) * gain))
    }

    return scaled
  })
}

function measurePeak(channelData: readonly Float32Array[]): number {
  let peak = 0

  for (const channel of channelData) {
    for (let index = 0; index < channel.length; index += 1) {
      peak = Math.max(peak, Math.abs(channel[index] ?? 0))
    }
  }

  return peak
}

function mixToMono(channelData: readonly Float32Array[]): Float32Array {
  if (channelData.length === 1) {
    return channelData[0]
  }

  const length = Math.min(...channelData.map((channel) => channel.length))
  const mono = new Float32Array(length)

  for (let index = 0; index < length; index += 1) {
    let sample = 0

    for (const channel of channelData) {
      sample += channel[index] ?? 0
    }

    mono[index] = sample / channelData.length
  }

  return mono
}

function mixToStereo(channelData: readonly Float32Array[]): {
  readonly left: Float32Array
  readonly right: Float32Array
} {
  if (channelData.length >= 2) {
    return {
      left: channelData[0],
      right: channelData[1],
    }
  }

  const mono = channelData[0] ?? new Float32Array(0)

  return {
    left: mono,
    right: mono,
  }
}

function toInt16Chunk(samples: Float32Array): Int16Array {
  const int16 = new Int16Array(samples.length)

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0))
    int16[index] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff)
  }

  return int16
}

function toUint8Array(buffer: Int8Array | Uint8Array): Uint8Array {
  return buffer instanceof Uint8Array
    ? buffer
    : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
}

function concatUint8Arrays(buffers: Uint8Array[]): Uint8Array {
  const totalLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0

  for (const buffer of buffers) {
    result.set(buffer, offset)
    offset += buffer.byteLength
  }

  return result
}

function toRelativePath(filePath: string): string {
  return path.relative(process.cwd(), filePath)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const kib = bytes / 1024
  if (kib < 1024) {
    return `${roundToOneDecimal(kib)} KB`
  }

  return `${roundToOneDecimal(kib / 1024)} MB`
}

function roundToOneDecimal(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '')
}
