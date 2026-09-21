# The lean dev server

`npm run dev` is the local default and stays as it is: DEV labs, UI-kit gallery
and every sourcemap, because that is what the verification scripts drive and
what a stack trace on this machine needs.

`npm run dev:lean` is the same server for the case where the person looking at
it is not sitting at this machine — a tunnel, a phone on another network, a
reviewer on another continent.

## What it measures

Cold open of `/`, measured on this kit:

| | `npm run dev` | `npm run dev:lean` |
| --- | --- | --- |
| on the wire | 29.27 MB | **4.22 MB** |
| of which inline sourcemaps | 19.04 MB | **0** |
| dependency prebundle | 25.48 MB | **1.52 MB** |
| HMR | per-module, no reload | **per-module, no reload** |

Reproduce it rather than trusting the table:

```bash
npm run dev:lean -- --port 5181
npm run measure:dev http://localhost:5181/ lean
```

## What changes, and what does not

Three things change. None of them touches the dev loop.

**The showcase surfaces leave the module graph.** The DEV labs, the UI-kit
gallery and the demo world hang off one literal (`__SHOWCASE_SURFACES__`), so
lean mode stops them being *fetched* rather than merely making them
unreachable.

**Inline sourcemaps are stripped.** Vite bakes a base64 map into every
transformed module and into every prebundled dependency chunk, and there is no
config switch for it — `optimizeDeps.rolldownOptions.output.sourcemap` is
omitted from the type on purpose. So `vite/devLeanTransportPlugin.ts` takes them
off the response instead.

**Responses are compressed.** The dev server otherwise speaks identity encoding
to everyone, which is invisible on a LAN and decisive across an ocean. Brotli at
quality 5 rather than the default 11: at 11 a cold transform spends seconds per
chunk and the link stops being the slow part.

## What it does NOT fix

Round trips, which is what hurts most at high latency. `npm run dev:lean --
--bundle` turns on Vite 8's experimental `bundledDev` and collapses them — at
the cost of HMR, because every edit then re-bundles the whole app and the
browser sits on a holding page until it can full-reload.

It also panicked rolldown 1.1.4 once during a burst of edits across five files
(`index out of bounds: the len is 14 but the index is 14`), taking the server
with it. So it is opt-in, for handing a link to somebody who will look at the
project rather than edit it.

## The transport plugin

`vite/devLeanTransportPlugin.ts` is transport only: it changes the bytes on the
wire, never the module graph and never a transform result the browser would
execute differently.

It buffers the response, which means it has to defer `writeHead` as well — a
middleware that flushes its headers before streaming a body would otherwise make
the later `setHeader` for `content-encoding` throw `ERR_HTTP_HEADERS_SENT` and
take the dev server down with it. That is not hypothetical; it is what the first
version of that file did.
