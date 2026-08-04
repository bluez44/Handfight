# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

HandFight is a 2-player browser fighting game driven by webcam hand gestures. Two independent app directories, **no root package.json / no monorepo tooling** (Turborepo, workspaces, etc. are not wired up despite what `ROADMAP.md` describes):

- `apps/client/` — React 19 + Vite 8 + TypeScript, MediaPipe hand tracking, PeerJS
- `apps/server/` — NestJS 11 signaling server (Socket.io)

Each app has its own `package.json`, `node_modules`, and lint/test config. Run commands from inside the app directory.

### Shared types are duplicated, not shared

`ROADMAP.md` describes a root `packages/shared/` workspace package — **this does not exist**. Instead, an identical `types.ts` lives in **two** places:

- `apps/client/packages/shared/src/types.ts`
- `apps/server/packages/shared/src/types.ts`

Both apps import via the relative path `../../packages/shared/src/types`. When editing `FrameData`, `RoomJoinPayload`, `SignalPayload`, or `GestureType`, **update both copies** or the client/server contract silently drifts.

## Commands

### Client (`apps/client/`)

```bash
npm run dev       # Vite dev server on http://localhost:5173
npm run build     # tsc -b && vite build
npm run lint      # eslint .
npm run preview   # serve built output
```

Note: `vite.config.ts` excludes `@mediapipe/tasks-vision` from `optimizeDeps` — required because the package ships WASM that Vite's pre-bundler chokes on. Don't remove this.

### Server (`apps/server/`)

```bash
npm run start:dev              # nest start --watch, listens on PORT || 3000
npm run build                  # nest build → dist/
npm run start:prod             # node dist/main
npm run lint                   # eslint --fix
npm run format                 # prettier --write

npm test                       # all jest specs (rootDir: src, pattern: *.spec.ts)
npm test -- game.gateway       # single file (filename substring match)
npm test -- -t "handleJoin"    # single describe/it by test name
npm run test:watch
npm run test:cov
npm run test:e2e               # uses test/jest-e2e.json
```

CORS origin is `process.env.CLIENT_URL || '*'`. Server port is `process.env.PORT || 3000`.

## Architecture

### End-to-end connection flow

The server is a **signaling-only** relay — game data never touches it. After connection setup, both players talk P2P via WebRTC and the server is idle.

1. Client A: `socket.emit('room:create')` → server generates a 5-char uppercase code, stores `roomCode → [socketA.id]` in an in-memory `Map`, returns `room:created`.
2. Client B: `socket.emit('room:join', { roomCode })` → server pushes `socketB.id` into the room, broadcasts `room:ready` to **both** sockets with `{ roomCode, initiator: room[0], joiner: room[1] }`.
3. Both clients construct `new Peer()` — this uses **PeerJS's default public cloud broker** (`0.peerjs.com`) for PeerJS-ID assignment. The `signal` handler on the server exists (`@SubscribeMessage('signal')` in `game.gateway.ts`) but the current client does **not** use manual SDP/ICE relay through it; the PeerJS cloud handles that.
4. On PeerJS `open`, each client emits `peer:id` with its PeerJS ID; the server relays it to the room's other socket.
5. Only the initiator calls `peer.connect(remotePeerId)`; the joiner listens for `peer.on('connection')`. Both then wire the same `DataConnection` via `setupDataConnection`.
6. Frame data (`{ ts, wrist: [x, y], gesture }`, ~50 bytes) is JSON-stringified and sent every frame over the DataChannel.

Race condition worth remembering (already handled in `NetworkManager.initPeer`): the initiator can receive the remote `peer:id` **before** its own `Peer` fires `open`. The code caches `remotePeerId` and connects from whichever handler fires last. Preserve this pattern if refactoring.

### Client structure

`apps/client/src/App.tsx` is currently a scratch harness — everything (room UI, MediaPipe init, camera stream, render loop, network wiring) lives in one component. The roadmap's `game/`, `hand/`, `store/`, `components/` directories are aspirational, not present. Expect to create them as features land.

MediaPipe uses **`@mediapipe/tasks-vision`** (the current Tasks API), not the deprecated `@mediapipe/hands` package that `ROADMAP.md` references. `HandLandmarker.createFromOptions` + `detectForVideo` + a `requestAnimationFrame` loop that compares `video.currentTime` to skip redundant inferences.

`NetworkManager` exposes three callback fields (`onConnected`, `onFrameData`, `onDisconnected`) — assign these before calling `createRoom()` / `joinRoom()` or you'll miss early events. `sendFrame` silently drops when `conn?.open` is false — that's intentional (frames are lossy by design), don't add error handling that would surface it.

### Server structure

Standard NestJS: `AppModule` imports `GatewayModule` which provides `GameGateway`. The gateway holds room state in a private `Map<string, string[]>` (in-process, in-memory — no Redis, so **do not scale beyond one instance**). `handleDisconnect` scans every room to find the leaving socket; fine at small scale but O(rooms) per disconnect.

The `ping` handler and connection-count logging in `onModuleInit` are debug scaffolding — feel free to remove if they get in the way.

### Testing pattern (server)

`game.gateway.spec.ts` shows the convention: build the gateway via `Test.createTestingModule`, then hand-roll mock sockets and a mock server with `jest.fn()`s for `join`, `to().emit`, etc. When adding gateway methods, follow the same "create mock socket, assert on `.to().emit()` chain" style rather than pulling in a real Socket.io test client.

## Roadmap vs. reality

`ROADMAP.md` is the design doc for the full 7-phase build (Phaser arena, gesture classifier, Zustand store, Vercel/Railway deploy). Treat it as intent, not spec — it predates the current code, uses an older MediaPipe API, and describes files/packages that don't exist yet. When it conflicts with what's actually in the tree, the tree wins.
