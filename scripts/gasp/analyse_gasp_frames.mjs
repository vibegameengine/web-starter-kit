// @important docs/gasp-reference.md "Measured in play" quotes this output; input is measure_gasp_pie.py's frames.json.
import { readFileSync } from 'node:fs'

const DEFAULT_FRAMES = 'E:/Projects/GameAnimationSample_5.8/Saved/gasp_measure/frames.json'
const SPEED_TIMES = [0, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 2.9]
const YAW_TIMES = [0, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2.9]
const CAMERA_TIMES = [0, 0.25, 0.5, 1, 2.9]

const frames = JSON.parse(readFileSync(process.argv[2] ?? DEFAULT_FRAMES, 'utf8'))
const phases = {}
for (const frame of frames) (phases[frame.phase] ??= []).push(frame)

const round = (value, digits = 1) => Number(value.toFixed(digits))
const nearest = (list, time) =>
  list.reduce((best, frame) => (Math.abs(frame.phase_time - time) < Math.abs(best.phase_time - time) ? frame : best), list[0])
const within = (list, times) => times.filter((time) => time <= list.at(-1).phase_time)

for (const [phase, list] of Object.entries(phases)) {
  const meanDelta = list.reduce((sum, frame) => sum + frame.delta, 0) / list.length
  const peak = Math.max(...list.map((frame) => frame.speed))
  const reached90 = list.find((frame) => frame.speed >= 0.9 * peak)
  const last = list.at(-1)
  console.log(
    `\n${phase}: ${list.length} frames, ${round(meanDelta * 1000, 0)} ms/frame, peak ${round(peak, 0)} cm/s, 90% at ${reached90 ? round(reached90.phase_time, 2) : '-'} s`,
  )
  console.log('  speed', within(list, SPEED_TIMES).map((t) => `${t}:${round(nearest(list, t).speed, 0)}`).join(' '))
  console.log('  yaw  ', within(list, YAW_TIMES).map((t) => `${t}:${round(nearest(list, t).yaw, 0)}`).join(' '))
  console.log(
    '  camera local [forward,right,up]',
    within(list, CAMERA_TIMES)
      .map((t) => `${t}:[${nearest(list, t).camera_offset_local.map((v) => round(v, 0))}]`)
      .join(' '),
    'pitch',
    round(last.camera_pitch),
    'fov',
    round(last.camera_fov),
    'camera yaw',
    round(last.camera_yaw),
  )
}
