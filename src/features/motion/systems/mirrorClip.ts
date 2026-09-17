import type { AnimationClip, KeyframeTrack } from 'three'

const SIDE_NAMES = /(Left|Right)/

function mirroredBoneName(trackName: string): string {
  return trackName.replace(SIDE_NAMES, (side) => (side === 'Left' ? 'Right' : 'Left'))
}

function mirroredQuaternions(values: Float32Array | Float64Array | number[]): void {
  for (let index = 0; index < values.length; index += 4) {
    values[index + 1] = -values[index + 1]
    values[index + 2] = -values[index + 2]
  }
}

function mirroredPositions(values: Float32Array | Float64Array | number[]): void {
  for (let index = 0; index < values.length; index += 3) {
    values[index] = -values[index]
  }
}

function mirroredTrack(track: KeyframeTrack): KeyframeTrack {
  const mirrored = track.clone()
  mirrored.name = mirroredBoneName(track.name)
  if (track.name.endsWith('.quaternion')) mirroredQuaternions(mirrored.values)
  if (track.name.endsWith('.position')) mirroredPositions(mirrored.values)
  return mirrored
}

export function mirrorClip(source: AnimationClip, name: string): AnimationClip {
  const mirrored = source.clone()
  mirrored.name = name
  mirrored.tracks = source.tracks.map(mirroredTrack)
  return mirrored
}
