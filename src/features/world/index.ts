/**
 * Public API of the `world` feature slice. Cross-slice consumers (the router,
 * other features) import the screen from here; the scene composition in
 * `scenes/demo-scene` deep-imports the individual entities/materials directly.
 */
export { GameScreen } from './ui/GameScreen'
