// Browser stub for the Node `ws` package.
//
// `photon-realtime` (the Photon Realtime SDK) does `require("ws")` inside a branch that
// only runs when the native `WebSocket` global is absent (i.e. Node). Browsers never
// take that branch — but Vite eagerly bundles the `require`, and the real `ws` package's
// browser build throws "ws does not work in the browser" on import. Aliasing `ws` to
// this harmless shim keeps the client bundle happy while the SDK uses native WebSocket.
const WS = typeof WebSocket !== 'undefined' ? WebSocket : undefined
export default WS
export { WS as WebSocket }
