function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) {
      throw new Error(`Canonical simulation numbers must be safe integers: ${value}`)
    }
    const encoded = JSON.stringify(value)
    if (encoded === undefined) {
      throw new Error(`Unsupported canonical value: ${String(value)}`)
    }
    return encoded
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`
  }
  const record = value as { readonly [key: string]: unknown }
  const fields = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
  return `{${fields.join(',')}}`
}

/** Stable UTF-8 bytes with recursively sorted object keys. */
export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value))
}
