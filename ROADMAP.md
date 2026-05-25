# 🥊 HandFight — Kế Hoạch Phát Triển

**Tech Stack:** React + Phaser 3 · MediaPipe Hands · PeerJS (WebRTC) · NestJS + Socket.io · Vercel + Railway

---

## Tổng quan kiến trúc

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Vercel)                    │
│                                                         │
│  React App                                              │
│  ├── UI Layer (React)       ← Menu, HUD, Room UI        │
│  ├── Game Layer (Phaser 3)  ← Arena, Physics, Sprites   │
│  ├── Hand Layer (MediaPipe) ← Camera, Gesture detect    │
│  └── Network Layer (PeerJS) ← WebRTC DataChannel        │
└────────────────────┬────────────────────────────────────┘
                     │ WebRTC P2P (game data)
                     │ Socket.io (signaling only)
┌────────────────────▼────────────────────────────────────┐
│              SIGNALING SERVER (Railway)                 │
│              NestJS + Socket.io Gateway                 │
│  Nhiệm vụ: match players, trao đổi SDP/ICE             │
│  Sau khi kết nối P2P xong → server không cần nữa       │
└─────────────────────────────────────────────────────────┘
```

---

## Cấu trúc thư mục dự án

```
handfight/
├── apps/
│   ├── client/                  ← React + Phaser 3 (Vercel)
│   │   ├── public/
│   │   │   └── assets/
│   │   │       ├── sprites/     ← sprite sheets PNG
│   │   │       └── audio/       ← sfx
│   │   └── src/
│   │       ├── components/      ← React UI components
│   │       ├── game/            ← Phaser 3 scenes & logic
│   │       ├── hand/            ← MediaPipe integration
│   │       ├── network/         ← PeerJS + Socket.io client
│   │       └── store/           ← Zustand global state
│   │
│   └── server/                  ← NestJS (Railway)
│       └── src/
│           ├── rooms/           ← room matching logic
│           └── gateway/         ← Socket.io gateway
│
├── packages/
│   └── shared/                  ← types dùng chung client + server
│       └── src/
│           ├── types.ts         ← GameState, LandmarkData, etc.
│           └── constants.ts     ← game config
│
└── package.json                 ← nx / turborepo monorepo
```

---

## Phase 0 — Chuẩn bị môi trường

**Mục tiêu:** Dựng monorepo, cài tools, chạy được "Hello World" cả 2 apps.

**Thời gian ước tính:** 1 ngày

### Bước 0.1 — Khởi tạo monorepo

```bash
# Dùng Turborepo (nhẹ, đơn giản)
npx create-turbo@latest handfight
cd handfight

# Xóa apps mặc định, tạo lại
rm -rf apps/*
```

### Bước 0.2 — Tạo React client

```bash
cd apps
npm create vite@latest client -- --template react-ts
cd client
npm install
```

Cài dependencies chính:

```bash
npm install phaser @types/phaser
npm install @mediapipe/hands @mediapipe/camera_utils
npm install peerjs socket.io-client
npm install zustand
npm install @tanstack/react-query
```

### Bước 0.3 — Tạo NestJS server

```bash
cd apps
npx @nestjs/cli new server
cd server
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
npm install @nestjs/config
```

### Bước 0.4 — Shared types package

```bash
mkdir -p packages/shared/src
```

Tạo `packages/shared/src/types.ts`:

```typescript
// Dữ liệu gửi qua WebRTC mỗi frame (~50 bytes)
export interface FrameData {
  ts: number;                  // timestamp
  wrist: [number, number];     // [x, y] normalized 0-1
  gesture: GestureType;        // action đã classify sẵn
}

export type GestureType = 'idle' | 'punch' | 'block' | 'special' | 'move';

// Signaling messages qua Socket.io
export interface RoomJoinPayload  { roomCode: string; }
export interface RoomStatePayload { roomCode: string; playerCount: 1 | 2; }
export interface SignalPayload    { roomCode: string; signal: unknown; }
```

### Checkpoint ✅

- [ ] `npm run dev` ở root chạy được cả client lẫn server
- [ ] Client hiện trang React trắng tại `localhost:5173`
- [ ] Server NestJS chạy tại `localhost:3000`

---

## Phase 1 — Signaling Server (NestJS)

**Mục tiêu:** Server match 2 người chơi và relay WebRTC signals.

**Thời gian ước tính:** 1–2 ngày

### Bước 1.1 — Socket.io Gateway

Tạo `apps/server/src/gateway/game.gateway.ts`:

```typescript
@WebSocketGateway({ cors: { origin: '*' } })
export class GameGateway {
  @WebSocketServer() server: Server;

  // rooms: Map<roomCode, socketId[]>
  private rooms = new Map<string, string[]>();

  @SubscribeMessage('room:create')
  handleCreate(@ConnectedSocket() client: Socket) {
    const code = this.generateCode();   // 5 ký tự random
    this.rooms.set(code, [client.id]);
    client.join(code);
    return { event: 'room:created', data: { roomCode: code } };
  }

  @SubscribeMessage('room:join')
  handleJoin(@MessageBody() payload: RoomJoinPayload,
             @ConnectedSocket() client: Socket) {
    const room = this.rooms.get(payload.roomCode);
    if (!room || room.length >= 2)
      return { event: 'room:error', data: 'Room full or not found' };

    room.push(client.id);
    client.join(payload.roomCode);

    // Thông báo cả 2 player đã sẵn sàng → bắt đầu WebRTC handshake
    this.server.to(payload.roomCode).emit('room:ready', {
      roomCode: payload.roomCode,
      initiator: room[0],   // player đầu tiên là initiator
    });
  }

  // Relay WebRTC signal giữa 2 peers
  @SubscribeMessage('signal')
  handleSignal(@MessageBody() payload: SignalPayload,
               @ConnectedSocket() client: Socket) {
    client.to(payload.roomCode).emit('signal', payload.signal);
  }

  @SubscribeMessage('disconnect')
  handleDisconnect(@ConnectedSocket() client: Socket) {
    // Xóa player khỏi room, notify đối thủ
    this.rooms.forEach((players, code) => {
      if (players.includes(client.id)) {
        this.server.to(code).emit('room:playerLeft');
        this.rooms.delete(code);
      }
    });
  }

  private generateCode(): string {
    return Math.random().toString(36).slice(2, 7).toUpperCase();
  }
}
```

### Bước 1.2 — Config CORS + Env

```typescript
// main.ts
app.enableCors({ origin: process.env.CLIENT_URL || '*' });
```

### Bước 1.3 — Test với Postman / wscat

```bash
npx wscat -c ws://localhost:3000
> {"event":"room:create","data":{}}
< {"event":"room:created","data":{"roomCode":"KR4X9"}}
```

### Checkpoint ✅

- [ ] Tạo room → nhận roomCode
- [ ] 2 clients join cùng room → cả 2 nhận `room:ready`
- [ ] Signal relay hoạt động (echo giữa 2 clients)
- [ ] Disconnect → đối thủ nhận `room:playerLeft`

---

## Phase 2 — WebRTC P2P Connection (PeerJS)

**Mục tiêu:** 2 tab trình duyệt kết nối P2P, gửi nhận data thành công.

**Thời gian ước tính:** 2 ngày

### Bước 2.1 — Network Manager class

Tạo `apps/client/src/network/NetworkManager.ts`:

```typescript
import Peer, { DataConnection } from 'peerjs';
import { io, Socket } from 'socket.io-client';
import type { FrameData } from '@handfight/shared';

export class NetworkManager {
  private socket: Socket;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;

  // Callbacks
  onConnected?: () => void;
  onFrameData?: (data: FrameData) => void;
  onDisconnected?: () => void;

  constructor(private serverUrl: string) {
    this.socket = io(serverUrl);
    this.setupSocketListeners();
  }

  // ── Create room ──────────────────────────────────────
  createRoom(): Promise<string> {
    return new Promise(resolve => {
      this.socket.emit('room:create');
      this.socket.once('room:created', ({ roomCode }) => resolve(roomCode));
    });
  }

  // ── Join room ─────────────────────────────────────────
  joinRoom(roomCode: string) {
    this.socket.emit('room:join', { roomCode });
  }

  // ── Socket listeners ──────────────────────────────────
  private setupSocketListeners() {
    this.socket.on('room:ready', ({ initiator }) => {
      const isInitiator = initiator === this.socket.id;
      this.initPeer(isInitiator);
    });

    // Relay signal từ đối thủ → PeerJS
    this.socket.on('signal', (signal) => {
      this.peer?.signal(signal);
    });
  }

  // ── PeerJS setup ──────────────────────────────────────
  private initPeer(initiator: boolean) {
    this.peer = new Peer({
      initiator,
      trickle: true,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    });

    // PeerJS tạo ra signal → gửi lên server để relay
    this.peer.on('signal', (signal) => {
      this.socket.emit('signal', { roomCode: this.currentRoom, signal });
    });

    // Kết nối P2P thành công
    this.peer.on('connect', () => {
      console.log('[P2P] Connected!');
      this.onConnected?.();
    });

    // Nhận data từ đối thủ
    this.peer.on('data', (raw) => {
      const data: FrameData = JSON.parse(raw);
      this.onFrameData?.(data);
    });

    this.peer.on('close', () => this.onDisconnected?.());
    this.peer.on('error', (err) => console.error('[P2P]', err));
  }

  // ── Send frame data ───────────────────────────────────
  // Gọi mỗi frame (30fps) — unreliable như UDP
  sendFrame(data: FrameData) {
    if (this.conn?.open) {
      // JSON nhỏ gọn ~50 bytes/frame
      this.conn.send(JSON.stringify(data));
    }
  }

  disconnect() {
    this.peer?.destroy();
    this.socket.disconnect();
  }
}
```

### Bước 2.2 — Test kết nối

Tạo test page đơn giản, mở 2 tab:

```typescript
// Tab 1: tạo room
const net = new NetworkManager('http://localhost:3000');
const code = await net.createRoom();
console.log('Room:', code);
net.onConnected = () => console.log('P2P connected!');
net.onFrameData = (d) => console.log('Got:', d);

// Tab 2: join room
const net2 = new NetworkManager('http://localhost:3000');
net2.joinRoom('CODE_TỪ_TAB_1');
```

### Bước 2.3 — Đo latency

```typescript
// Ping-pong đo RTT
sendFrame({ ts: Date.now(), wrist: [0,0], gesture: 'idle' });
// Khi nhận: RTT = Date.now() - data.ts
// Mục tiêu: < 60ms trên cùng mạng LAN
```

### Checkpoint ✅

- [ ] 2 tab kết nối P2P thành công (không qua server sau bước này)
- [ ] Gửi FrameData 30fps, nhận đầy đủ
- [ ] RTT đo được < 60ms (cùng mạng)
- [ ] Disconnect một bên → bên kia nhận callback

---

## Phase 3 — MediaPipe Hand Tracking

**Mục tiêu:** Camera → landmarks → gesture → FrameData sẵn sàng gửi.

**Thời gian ước tính:** 2–3 ngày

### Bước 3.1 — HandTracker class

Tạo `apps/client/src/hand/HandTracker.ts`:

```typescript
import { Hands, Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import type { FrameData, GestureType } from '@handfight/shared';

export class HandTracker {
  private hands: Hands;
  private camera: Camera;

  onFrame?: (data: FrameData) => void;

  async init(videoElement: HTMLVideoElement) {
    this.hands = new Hands({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
    });

    this.hands.setOptions({
      maxNumHands: 1,          // mỗi player chỉ cần 1 tay
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.6,
    });

    this.hands.onResults(this.processResults.bind(this));

    this.camera = new Camera(videoElement, {
      onFrame: async () => this.hands.send({ image: videoElement }),
      width: 640, height: 480,
    });

    await this.camera.start();
  }

  private processResults(results: Results) {
    if (!results.multiHandLandmarks?.length) return;

    const lm = results.multiHandLandmarks[0];
    const wrist = lm[0];

    this.onFrame?.({
      ts: Date.now(),
      wrist: [wrist.x, wrist.y],
      gesture: this.classify(lm),
    });
  }

  // ── Gesture classifier ────────────────────────────────
  private classify(lm: NormalizedLandmark[]): GestureType {
    const fingerExtended = (i: number) =>
      i === 0
        ? Math.abs(lm[4].x - lm[2].x) > 0.07
        : lm[[4,8,12,16,20][i]].y < lm[[3,6,10,14,18][i]].y;

    const [idx, mid, ring, pinky] = [1,2,3,4].map(fingerExtended);
    const count = [idx, mid, ring, pinky].filter(Boolean).length;

    if (count === 0) return 'punch';
    if (count >= 4)  return 'block';
    if (idx && mid && !ring && !pinky) return 'special';
    if (idx && !mid) return 'move';
    return 'idle';
  }

  stop() { this.camera?.stop(); }
}
```

### Bước 3.2 — React hook

Tạo `apps/client/src/hand/useHandTracker.ts`:

```typescript
export function useHandTracker() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const [gesture, setGesture] = useState<GestureType>('idle');
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[]>([]);

  const init = useCallback(async () => {
    if (!videoRef.current) return;
    const tracker = new HandTracker();
    tracker.onFrame = (data) => {
      setGesture(data.gesture);
      // Cũng gửi qua P2P ở đây
    };
    await tracker.init(videoRef.current);
    trackerRef.current = tracker;
  }, []);

  useEffect(() => () => trackerRef.current?.stop(), []);

  return { videoRef, gesture, landmarks, init };
}
```

### Bước 3.3 — Camera permission UI

```typescript
// Component yêu cầu quyền camera trước khi vào game
export function CameraSetup({ onReady }) {
  const { videoRef, gesture, init } = useHandTracker();
  const [status, setStatus] = useState<'idle'|'loading'|'ready'>('idle');

  return (
    <div>
      <video ref={videoRef} style={{ display: 'none' }} />
      {/* Canvas overlay vẽ landmarks */}
      <LandmarkOverlay videoRef={videoRef} />
      <GestureIndicator gesture={gesture} />
      <button onClick={async () => { setStatus('loading'); await init(); setStatus('ready'); }}>
        Bật Camera
      </button>
      {status === 'ready' && <button onClick={onReady}>Sẵn sàng ▶</button>}
    </div>
  );
}
```

### Checkpoint ✅

- [ ] Camera bật được, hiện landmarks trên overlay canvas
- [ ] Console log 30 FrameData/giây
- [ ] 5 gesture nhận diện đúng > 85% lần thử
- [ ] Latency MediaPipe < 30ms

---

## Phase 4 — Phaser 3 Game Core

**Mục tiêu:** Arena chiến đấu hoàn chỉnh với sprites, physics, game logic.

**Thời gian ước tính:** 4–5 ngày

### Bước 4.1 — Tích hợp Phaser vào React

Tạo `apps/client/src/game/PhaserGame.tsx`:

```typescript
export function PhaserGame({ localFrames, remoteFrames }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: '100%',
      height: '100%',
      backgroundColor: '#08080f',
      scene: [PreloadScene, ArenaScene],
      physics: { default: 'arcade', arcade: { gravity: { y: 0 } } },
    });

    return () => gameRef.current?.destroy(true);
  }, []);

  // Bridge: React state → Phaser events
  useEffect(() => {
    gameRef.current?.events.emit('localFrame', localFrames);
  }, [localFrames]);

  return <div ref={containerRef} style={{ width:'100%', height:'100%' }} />;
}
```

### Bước 4.2 — PreloadScene

```typescript
export class PreloadScene extends Phaser.Scene {
  preload() {
    // Load sprite sheets
    // frameWidth = sheetWidth / frameCount
    this.load.spritesheet('p1-idle',    'assets/sprites/p1/idle.png',    { frameWidth:16, frameHeight:16 });
    this.load.spritesheet('p1-punch',   'assets/sprites/p1/punch.png',   { frameWidth:16, frameHeight:16 });
    this.load.spritesheet('p1-block',   'assets/sprites/p1/block.png',   { frameWidth:16, frameHeight:16 });
    this.load.spritesheet('p1-special', 'assets/sprites/p1/special.png', { frameWidth:16, frameHeight:16 });
    this.load.spritesheet('p1-hurt',    'assets/sprites/p1/hurt.png',    { frameWidth:16, frameHeight:16 });
    // p2 tương tự...

    // Audio
    this.load.audio('punch-sfx',   'assets/audio/punch.mp3');
    this.load.audio('block-sfx',   'assets/audio/block.mp3');
    this.load.audio('special-sfx', 'assets/audio/special.mp3');
  }

  create() { this.scene.start('ArenaScene'); }
}
```

### Bước 4.3 — ArenaScene

```typescript
export class ArenaScene extends Phaser.Scene {
  private p1!: Fighter;
  private p2!: Fighter;
  private hud!: HUD;

  create() {
    this.createAnimations();
    this.createArena();

    this.p1 = new Fighter(this, 200, 300, 'p1', 'left');
    this.p2 = new Fighter(this, 600, 300, 'p2', 'right');

    this.hud = new HUD(this);

    // Listen từ React bridge
    this.game.events.on('localFrame',  this.onLocalFrame,  this);
    this.game.events.on('remoteFrame', this.onRemoteFrame, this);
  }

  private onLocalFrame(data: FrameData) {
    this.p1.applyFrameData(data);
    this.checkHit(this.p1, this.p2);
  }

  private onRemoteFrame(data: FrameData) {
    // Interpolate position để tránh giật khi latency cao
    this.p2.applyFrameDataSmooth(data);
  }

  update() {
    this.p1.update();
    this.p2.update();
    this.hud.update(this.p1.hp, this.p2.hp);
  }

  private checkHit(attacker: Fighter, victim: Fighter) {
    if (attacker.gesture !== 'punch' && attacker.gesture !== 'special') return;
    const dist = Phaser.Math.Distance.Between(attacker.x, attacker.y, victim.x, victim.y);
    if (dist > 80) return;

    const dmg = attacker.gesture === 'special' ? 30 : 15;
    const actual = victim.isBlocking ? Math.floor(dmg * 0.4) : dmg;
    victim.takeDamage(actual);
    this.hud.showDamageNumber(actual, victim.x, victim.y);
  }

  private createAnimations() {
    const anims = [
      { key:'p1-idle',    frames:6, fps:8  },
      { key:'p1-punch',   frames:5, fps:16 },
      { key:'p1-block',   frames:4, fps:10 },
      { key:'p1-special', frames:7, fps:18 },
      { key:'p1-hurt',    frames:3, fps:14 },
      // p2...
    ];
    anims.forEach(({ key, frames, fps }) => {
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(key, { start:0, end:frames-1 }),
        frameRate: fps,
        repeat: ['idle','block'].includes(key.split('-')[1]) ? -1 : 0,
      });
    });
  }
}
```

### Bước 4.4 — Fighter class

```typescript
export class Fighter extends Phaser.GameObjects.Sprite {
  hp = 100;
  gesture: GestureType = 'idle';
  isBlocking = false;
  private specialCooldown = 0;
  private targetX = 0;  // cho smooth interpolation

  constructor(scene, x, y, private playerKey: string, private side: 'left'|'right') {
    super(scene, x, y, `${playerKey}-idle`);
    scene.add.existing(this);
    this.setScale(4);  // 16px → 64px display
    this.play(`${playerKey}-idle`);
    this.targetX = x;
  }

  applyFrameData(data: FrameData) {
    const { wrist, gesture } = data;
    this.gesture = gesture;
    this.isBlocking = gesture === 'block';

    // Map wrist.x (0-1) → arena X
    if (gesture === 'move') {
      this.targetX = Phaser.Math.Linear(50, 750, 1 - wrist[0]);
    }

    this.playAnimation(gesture);
  }

  // Smooth movement (lerp) — tránh giật cho remote player
  applyFrameDataSmooth(data: FrameData) {
    this.targetX = Phaser.Math.Linear(50, 750, data.wrist[0]);
    this.gesture = data.gesture;
    this.playAnimation(data.gesture);
  }

  update() {
    // Lerp vị trí
    this.x = Phaser.Math.Linear(this.x, this.targetX, 0.15);
    // Flip sprite theo hướng
  }

  takeDamage(amount: number) {
    this.hp = Math.max(0, this.hp - amount);
    this.playAnimation('hurt');
    this.scene.time.delayedCall(300, () => this.playAnimation(this.gesture));
    if (this.hp <= 0) this.scene.events.emit('playerKO', this.playerKey);
  }

  private playAnimation(gesture: GestureType) {
    const key = `${this.playerKey}-${gesture}`;
    if (this.anims.currentAnim?.key !== key) this.play(key);
  }
}
```

### Checkpoint ✅

- [ ] Phaser render được 2 nhân vật với sprite animation
- [ ] Di chuyển nhân vật bằng gesture
- [ ] Hệ thống HP + KO hoạt động
- [ ] HUD timer 60s đếm ngược
- [ ] Âm thanh khi đánh/đỡ

---

## Phase 5 — Ghép nối End-to-End

**Mục tiêu:** Toàn bộ flow hoạt động: Menu → Room → Camera → Fight → Result.

**Thời gian ước tính:** 3–4 ngày

### Bước 5.1 — Global state (Zustand)

```typescript
// store/useGameStore.ts
interface GameStore {
  // Phase
  phase: 'menu' | 'room' | 'camera' | 'fight' | 'result';

  // Room
  roomCode: string;
  isHost: boolean;
  opponentConnected: boolean;

  // Network
  network: NetworkManager | null;

  // Hand
  localGesture: GestureType;
  remoteFrameData: FrameData | null;

  // Actions
  createRoom: () => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  setPhase: (p: GameStore['phase']) => void;
}
```

### Bước 5.2 — App flow routing

```typescript
// App.tsx
export function App() {
  const phase = useGameStore(s => s.phase);

  return (
    <div className="app">
      {phase === 'menu'   && <MenuScreen />}
      {phase === 'room'   && <RoomScreen />}
      {phase === 'camera' && <CameraSetupScreen />}
      {phase === 'fight'  && <FightScreen />}
      {phase === 'result' && <ResultScreen />}
    </div>
  );
}
```

### Bước 5.3 — FightScreen: kết hợp tất cả

```typescript
export function FightScreen() {
  const { network, setPhase } = useGameStore();
  const { videoRef, init } = useHandTracker();

  // Local frame → Phaser + gửi qua P2P
  const handleLocalFrame = useCallback((frame: FrameData) => {
    network?.sendFrame(frame);          // → đối thủ
    gameRef.current?.events.emit('localFrame', frame);  // → Phaser
  }, [network]);

  // Remote frame → Phaser
  useEffect(() => {
    if (!network) return;
    network.onFrameData = (frame) => {
      gameRef.current?.events.emit('remoteFrame', frame);
    };
  }, [network]);

  return (
    <div>
      <HUDOverlay />
      <PhaserGame />
      <video ref={videoRef} style={{ display:'none' }} />
      <CameraFeedMini videoRef={videoRef} />
    </div>
  );
}
```

### Bước 5.4 — Handle edge cases

```typescript
// Đối thủ ngắt kết nối giữa chừng
network.onDisconnected = () => {
  setPhase('result');
  showResult('opponent_disconnected');
};

// Tab bị ẩn → tạm dừng camera để tiết kiệm CPU
document.addEventListener('visibilitychange', () => {
  if (document.hidden) tracker.pause();
  else tracker.resume();
});
```

### Checkpoint ✅

- [ ] Flow đầy đủ từ Menu → Result
- [ ] 2 người dùng 2 máy khác nhau chơi được
- [ ] Ngắt kết nối được xử lý gracefully
- [ ] Không bị memory leak khi chuyển màn hình

---

## Phase 6 — Deploy

**Mục tiêu:** Game live trên internet, truy cập được bằng URL.

**Thời gian ước tính:** 1–2 ngày

### Bước 6.1 — Deploy NestJS lên Railway

```bash
# Tạo Dockerfile cho server
cd apps/server
```

Tạo `apps/server/Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]
```

Tạo `apps/server/railway.json`:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "DOCKERFILE" },
  "deploy": { "startCommand": "node dist/main", "healthcheckPath": "/health" }
}
```

Cấu hình env trên Railway:
```
PORT=3000
CLIENT_URL=https://handfight.vercel.app
NODE_ENV=production
```

### Bước 6.2 — Deploy React lên Vercel

```bash
cd apps/client
```

Tạo `apps/client/vercel.json`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Cấu hình env trên Vercel:

```
VITE_SERVER_URL=https://handfight-server.up.railway.app
VITE_PEERJS_HOST=0.peerjs.com
```

### Bước 6.3 — HTTPS + STUN/TURN

WebRTC **bắt buộc HTTPS** khi deploy. Vercel và Railway đều tự động có SSL.

Thêm TURN server cho mạng NAT khó (hotspot điện thoại, corporate network):

```typescript
// NetworkManager.ts
iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  // TURN miễn phí (rate-limited) — đủ dùng để test
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]
```

### Checkpoint ✅

- [ ] `https://handfight.vercel.app` load được
- [ ] 2 người từ 2 mạng khác nhau kết nối P2P được
- [ ] Latency < 80ms (cùng thành phố)
- [ ] HTTPS hoạt động → camera permission được cấp

---

## Phase 7 — Polish & Tối ưu

**Thời gian ước tính:** 3–5 ngày (có thể làm song song)

### 7.1 — Giảm latency cảm nhận

```typescript
// Client-side prediction: không chờ server confirm, render ngay
// Sau đó reconcile nếu state lệch nhau

// Dead reckoning cho remote player
// Nếu không nhận frame trong 100ms → dự đoán vị trí tiếp theo
function predictRemotePosition(lastFrame: FrameData): FrameData {
  return {
    ...lastFrame,
    ts: Date.now(),
    wrist: [
      lastFrame.wrist[0] + velocity[0] * 0.033,
      lastFrame.wrist[1],
    ],
  };
}
```

### 7.2 — Tối ưu MediaPipe

```typescript
// Chạy MediaPipe trên Web Worker để không block main thread
// → animation mượt hơn khi tracking nặng
const worker = new Worker(new URL('./handWorker.ts', import.meta.url));
worker.postMessage({ type: 'PROCESS_FRAME', imageData });
worker.onmessage = ({ data }) => handleLandmarks(data.landmarks);
```

### 7.3 — Sprite assets đầy đủ

Hoàn thiện sprite sheets cho tất cả hành động:

| File | Frames | FPS | Ghi chú |
|------|--------|-----|---------|
| `idle.png`    | 6  | 8  | Breathing loop |
| `punch.png`   | 5  | 16 | Nhanh, snappy |
| `block.png`   | 4  | 10 | Giữ pose cuối |
| `special.png` | 7  | 18 | Dramatic windup |
| `hurt.png`    | 3  | 14 | Flash nhanh |

### 7.4 — Audio

```typescript
// Web Audio API — sfx nhẹ không cần load file lớn
// Dùng Phaser sound manager
this.sound.play('punch-sfx', { volume: 0.6 });

// Background music (loop)
this.sound.add('bgm-arena', { loop: true, volume: 0.3 }).play();
```

---

## Tóm tắt timeline

```
Tuần 1    Phase 0 + 1 + 2    Env setup, server, P2P connection
Tuần 2    Phase 3 + 4         MediaPipe + Phaser game core
Tuần 3    Phase 5             End-to-end integration
Tuần 4    Phase 6 + 7         Deploy + Polish
```

---

## Công cụ debug hữu ích

```typescript
// Hiện latency realtime trong game
const DEBUG = import.meta.env.DEV;
if (DEBUG) {
  // Overlay góc màn hình
  const overlay = document.createElement('div');
  overlay.id = 'debug-overlay';
  // RTT, FPS, gesture hiện tại
}
```

```bash
# Test P2P giữa 2 máy cùng mạng
# Machine A:
npx localtunnel --port 3000 --subdomain handfight-server

# Machine B:
VITE_SERVER_URL=https://handfight-server.loca.lt npm run dev
```

---

*Tài liệu này được cập nhật khi hoàn thành từng phase.*
