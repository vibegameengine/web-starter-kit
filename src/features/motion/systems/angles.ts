export function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

export function shortestAngle(from: number, to: number): number {
  return normalizeAngle(to - from)
}

export function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

export function approach(current: number, target: number, amount: number): number {
  return current < target ? Math.min(current + amount, target) : Math.max(current - amount, target)
}
