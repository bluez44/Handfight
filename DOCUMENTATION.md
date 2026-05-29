# HANDFIGHT — Tài Liệu Kỹ Thuật

> Tài liệu này giải thích toàn bộ cách hoạt động của dự án **Handfight** — một game chiến đấu đa người chơi theo thời gian thực sử dụng cử chỉ bàn tay làm điều khiển. Viết cho người mới bắt đầu với lập trình web.

---

## Mục Lục

1. [Tổng Quan Dự Án](#1-tổng-quan-dự-án)
2. [Cấu Trúc Thư Mục](#2-cấu-trúc-thư-mục)
3. [Luồng Hoạt Động Tổng Thể](#3-luồng-hoạt-động-tổng-thể)
4. [MediaPipe — Nhận Diện Bàn Tay](#4-mediapipe--nhận-diện-bàn-tay)
5. [Phân Loại Cử Chỉ Tay (handPose.ts)](#5-phân-loại-cử-chỉ-tay-handposets)
6. [Hook useHandTracking — Quản Lý Camera](#6-hook-usehandtracking--quản-lý-camera)
7. [Hook useBoxController — Điều Khiển Box](#7-hook-useboxcontroller--điều-khiển-box)
8. [Socket.IO — Máy Chủ Tín Hiệu](#8-socketio--máy-chủ-tín-hiệu)
9. [PeerJS / WebRTC — Kết Nối P2P](#9-peerjs--webrtc--kết-nối-p2p)
10. [NetworkManager — Lớp Mạng Trung Tâm](#10-networkmanager--lớp-mạng-trung-tâm)
11. [Hook useRoomConnection — Quản Lý Phòng](#11-hook-useroomconnection--quản-lý-phòng)
12. [Hook useRemoteBox — Hiển Thị Box Đối Thủ](#12-hook-useremotebox--hiển-thị-box-đối-thủ)
13. [Các Component UI](#13-các-component-ui)
14. [Trang Home — Điểm Kết Hợp](#14-trang-home--điểm-kết-hợp)
15. [Kiến Trúc SOLID](#15-kiến-trúc-solid)
16. [Các Khái Niệm Quan Trọng](#16-các-khái-niệm-quan-trọng)

---

## 1. Tổng Quan Dự Án

**Handfight** là một game chiến đấu chạy trên trình duyệt web. Thay vì dùng bàn phím hay chuột, người chơi điều khiển nhân vật bằng **cử chỉ bàn tay** thông qua webcam.

### Những gì xảy ra khi chơi game:

```
Camera của bạn                    Camera của đối thủ
      ↓                                   ↓
MediaPipe nhận diện tay           MediaPipe nhận diện tay
      ↓                                   ↓
Phân loại cử chỉ (fist, point…)   Phân loại cử chỉ
      ↓                                   ↓
Box của bạn di chuyển             Box của đối thủ di chuyển
      ↓                                   
Dữ liệu gửi qua WebRTC ──────────→ Nhận dữ liệu → hiển thị box đối thủ
```

### Công nghệ sử dụng:

| Công nghệ | Vai trò |
|-----------|---------|
| **React + TypeScript** | Giao diện người dùng |
| **MediaPipe Tasks Vision** | Nhận diện 21 điểm trên bàn tay qua webcam |
| **Socket.IO** | Trao đổi tín hiệu tạo/vào phòng |
| **PeerJS (WebRTC)** | Truyền dữ liệu game và video trực tiếp P2P |
| **Tailwind CSS v4** | Styling giao diện |
| **Vite** | Build tool và dev server |

---

## 2. Cấu Trúc Thư Mục

```
apps/client/src/
│
├── main.tsx                    # Điểm khởi động — render App vào DOM
├── App.tsx                     # Router + Provider bao bọc toàn bộ app
│
├── pages/
│   └── Home.tsx                # Trang chính — ghép tất cả hook và component lại
│
├── layout/
│   └── default.tsx             # Layout nền (căn giữa màn hình)
│
├── context/
│   └── networkManager.tsx      # React Context cung cấp NetworkManager toàn app
│
├── network/
│   └── NetworkManager.ts       # Lớp xử lý Socket.IO + PeerJS
│
├── hooks/
│   ├── useHandTracking.ts      # Khởi động MediaPipe, chạy vòng lặp nhận diện
│   ├── useBoxController.ts     # Vật lý box: trọng lực, nhảy, di chuyển theo tay
│   ├── useRoomConnection.ts    # Quản lý trạng thái phòng và kết nối mạng
│   └── useRemoteBox.ts         # Cập nhật vị trí box của đối thủ từ dữ liệu mạng
│
├── components/
│   ├── LoadingScreen.tsx        # Màn hình chờ khởi động MediaPipe
│   ├── LobbyScreen.tsx          # Màn hình lobby: tạo/vào phòng
│   ├── WaitingScreen.tsx        # Màn hình chờ đối thủ
│   ├── BoxEntity.tsx            # Box nhân vật (local hoặc remote)
│   ├── HandCamOverlay.tsx       # Preview webcam + skeleton tay (góc dưới phải)
│   └── RemoteVideo.tsx          # Video webcam của đối thủ (góc dưới trái)
│
└── utils/
    └── handPose.ts              # Logic phân loại cử chỉ từ 21 điểm landmark
```

---

## 3. Luồng Hoạt Động Tổng Thể

### Giai đoạn 1 — Khởi động

```
App render
  → NetworkManagerProvider tạo 1 instance NetworkManager (kết nối Socket.IO)
  → Home render
  → useHandTracking chạy:
      1. Tải model MediaPipe từ CDN (~40%)
      2. Xin quyền truy cập webcam (~60%)
      3. Bắt đầu vòng lặp nhận diện (~100%)
  → Hiển thị LoadingScreen trong khi loadingPercent < 100
```

### Giai đoạn 2 — Lobby

```
loadingPercent === 100
  → Hiển thị LobbyScreen
  → Người dùng nhấn "CREATE ROOM":
      → useRoomConnection.createRoom()
      → socket.emit("room:create") → server trả về roomCode
      → Chuyển sang WaitingScreen với mã phòng
  → Hoặc nhập mã và nhấn "JOIN":
      → useRoomConnection.joinRoom(code)
      → socket.emit("room:join", { roomCode })
```

### Giai đoạn 3 — Kết nối P2P

```
Hai người trong cùng phòng
  → Server gửi "room:ready" cho cả hai
  → Mỗi người tạo Peer (PeerJS)
  → Người khởi tạo (initiator) kết nối data channel
  → Cả hai thiết lập media channel (video call)
  → onConnected() được gọi → state = "connected"
```

### Giai đoạn 4 — Game đang chạy

```
Mỗi frame (~60fps):
  useHandTracking       → cập nhật landmarksRef
  useBoxController      → đọc landmarksRef → vật lý → setState + sendFrame()
  sendFrame()           → NetworkManager.sendFrame() → PeerJS data channel
  [đối thủ nhận được]  → remoteFrameRef cập nhật
  useRemoteBox          → đọc remoteFrameRef → LERP → setState box đối thủ
```

---

## 4. MediaPipe — Nhận Diện Bàn Tay

### MediaPipe là gì?

MediaPipe là thư viện của Google giúp nhận diện các vật thể qua camera. Trong dự án này, chúng ta dùng module **Hand Landmarker** — có thể tìm ra **21 điểm chính xác** trên bàn tay trong mỗi frame video.

### 21 điểm Landmark

```
                 8   12  16  20
                 |   |   |   |
                 7   11  15  19
                 |   |   |   |
             4   6   10  14  18
             |   |   |   |   |
             3   5   9   13  17
              \  |   |   |   |
               2 |   |   |   |
                \|___|___|___|
                     0  ← WRIST (cổ tay)
```

Mỗi điểm có tọa độ `x`, `y` (từ 0.0 đến 1.0 — chuẩn hóa theo kích thước video), và `z` (độ sâu).

### Các điểm quan trọng (file: `utils/handPose.ts`)

```typescript
export const LM = {
  WRIST: 0,        // Cổ tay
  THUMB_TIP: 4,    // Đầu ngón cái
  INDEX_MCP: 5,    // Khớp gốc ngón trỏ
  INDEX_TIP: 8,    // Đầu ngón trỏ
  MIDDLE_MCP: 9,   // Khớp gốc ngón giữa
  MIDDLE_TIP: 12,  // Đầu ngón giữa
  RING_TIP: 16,    // Đầu ngón áp út
  PINKY_MCP: 17,   // Khớp gốc ngón út
  PINKY_TIP: 20,   // Đầu ngón út
  // ... và các điểm còn lại
}
```

### Cách khởi động MediaPipe

```typescript
// Bước 1: Tải file WASM (WebAssembly) — chạy model AI trong trình duyệt
const vision = await FilesetResolver.forVisionTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
);

// Bước 2: Tạo HandLandmarker với các tùy chọn
const handLandmarker = await HandLandmarker.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath: "https://storage.googleapis.com/.../hand_landmarker.task",
    delegate: "GPU",  // Dùng GPU để xử lý nhanh hơn
  },
  runningMode: "VIDEO",    // Chế độ video (liên tục)
  numHands: 2,             // Nhận diện tối đa 2 tay
  minHandDetectionConfidence: 0.5,  // Ngưỡng tin cậy
});

// Bước 3: Vòng lặp nhận diện mỗi frame
const renderLoop = () => {
  const results = handLandmarker.detectForVideo(video, Date.now());
  // results.landmarks là mảng các bàn tay, mỗi bàn tay có 21 điểm
  landmarksRef.current = results.landmarks;
  requestAnimationFrame(renderLoop);
};
```

### Tại sao dùng `requestAnimationFrame`?

`requestAnimationFrame` (rAF) là API của trình duyệt cho phép chạy code ngay trước khi trình duyệt vẽ lại màn hình — thường ~60 lần/giây. Đây là cách chuẩn để làm animation mượt mà và game loop.

---

## 5. Phân Loại Cử Chỉ Tay (handPose.ts)

### 19 cử chỉ được nhận diện

| Cử chỉ | Emoji | Mô tả |
|--------|-------|-------|
| `fist` | ✊ | Nắm tay — tất cả ngón cụp |
| `open` | 🖐 | Mở tay — tất cả ngón duỗi |
| `point` | ☝ | Chỉ ngón trỏ |
| `peace` | ✌ | Ngón trỏ + ngón giữa |
| `thumbs_up` | 👍 | Chỉ ngón cái, đầu ngón cao hơn cổ tay |
| `thumbs_down` | 👎 | Chỉ ngón cái, đầu ngón thấp hơn cổ tay |
| `gun` | 👉 | Ngón cái + ngón trỏ |
| `call` | 🤙 | Ngón cái + ngón út |
| `rock` | 🤘 | Ngón trỏ + ngón út |
| `spiderman` | 🕷 | Ngón cái + ngón trỏ + ngón út |
| `ok` | 👌 | Ngón cái chạm ngón trỏ, các ngón còn lại mở |
| `pinch` | 🤌 | Ngón cái chạm ngón trỏ, các ngón còn lại cụp |
| `four` | 4️⃣ | Bốn ngón duỗi (không có ngón cái) |
| `three` | 3️⃣ | Ngón trỏ + giữa + áp út |
| `middle` | 🖕 | Chỉ ngón giữa |
| `ring` | 💍 | Chỉ ngón áp út |
| `pinky` | 🤙 | Chỉ ngón út |
| `none` | — | Không có tay nào trong frame |
| `unknown` | ? | Có tay nhưng không khớp cử chỉ nào |

### Thuật toán phát hiện ngón tay duỗi

Vấn đề: Nếu chỉ so sánh tọa độ Y (cao/thấp), sẽ sai khi bàn tay nghiêng. Giải pháp: **chiếu lên trục của bàn tay**.

```typescript
function isExtended(lm, tipIdx, pipIdx, axisX, axisY): boolean {
  // axisX, axisY là vector từ cổ tay → khớp giữa ngón giữa (trục bàn tay)
  const w = lm[LM.WRIST];

  // Chiếu vị trí đầu ngón lên trục bàn tay
  const tipProj = dot(lm[tipIdx].x - w.x, lm[tipIdx].y - w.y, axisX, axisY);
  // Chiếu vị trí khớp giữa lên trục bàn tay
  const pipProj = dot(lm[pipIdx].x - w.x, lm[pipIdx].y - w.y, axisX, axisY);

  // Nếu đầu ngón xa cổ tay hơn khớp giữa → ngón duỗi
  return tipProj > pipProj;
}
```

**Tại sao dùng dot product (tích vô hướng)?** Dot product của hai vector cho biết "mức độ cùng chiều" của chúng. Bằng cách chiếu lên trục bàn tay, phép kiểm tra hoạt động đúng dù bàn tay xoay theo bất kỳ góc nào.

### Thuật toán phát hiện ngón cái

Ngón cái khó hơn vì nó có thể duỗi sang ngang, không phải lên trên.

```typescript
function isThumbExtended(lm): boolean {
  // Chiều rộng lòng bàn tay = khoảng cách từ khớp ngón trỏ đến khớp ngón út
  const palmWidth = dist(lm[LM.INDEX_MCP], lm[LM.PINKY_MCP]);

  // Nếu đầu ngón cái xa khớp ngón trỏ hơn 60% chiều rộng lòng bàn tay → duỗi
  return palmWidth > 0.01 &&
    dist(lm[LM.THUMB_TIP], lm[LM.INDEX_MCP]) > palmWidth * 0.6;
}
```

### Phát hiện Pinch (chụm tay)

```typescript
// Tỷ lệ chụm = khoảng cách đầu ngón cái - đầu ngón trỏ / chiều rộng lòng bàn tay
const pinchRatio = dist(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]) / palmWidth;
const isPinching = pinchRatio < 0.35; // < 35% chiều rộng lòng bàn tay = đang chụm
```

### Thứ tự ưu tiên phân loại

```typescript
export function gestureFromFingers(f: FingerState): Gesture {
  // 1. Pinch-based trước tiên (ok, pinch)
  if (isPinching) { ... }

  // 2. Chỉ ngón cái (thumbs_up, thumbs_down)
  if (thumb && count === 0) { ... }

  // 3. Nắm tay
  if (!thumb && count === 0) return "fist";

  // 4. Tất cả ngón
  if (thumb && count === 4) return "open";

  // 5. Các tổ hợp có ngón cái
  if (thumb && index && pinky) return "spiderman";
  // ... v.v.

  return "unknown";
}
```

---

## 6. Hook useHandTracking — Quản Lý Camera

**File:** `src/hooks/useHandTracking.ts`

Hook này chịu trách nhiệm duy nhất: khởi động MediaPipe và chạy vòng lặp nhận diện.

### Những gì hook này làm:

1. Tải model MediaPipe (async, có tracking tiến độ)
2. Xin quyền truy cập webcam
3. Kết nối video stream với thẻ `<video>`
4. Chạy vòng lặp rAF để nhận diện liên tục
5. Vẽ skeleton lên `<canvas>` để người dùng thấy

### Giá trị trả về:

```typescript
return {
  videoRef,       // ref gắn vào thẻ <video> — MediaPipe đọc từ đây
  canvasRef,      // ref gắn vào thẻ <canvas> — vẽ skeleton lên đây
  loadingPercent, // 0 → 100, dùng để hiện màn hình loading
  landmarksRef,   // ref chứa mảng landmarks mới nhất — các hook khác đọc từ đây
  streamRef,      // ref chứa MediaStream — chia sẻ với P2P để truyền video
}
```

### Tại sao dùng `ref` thay vì `state` cho landmarks?

`useState` kích hoạt re-render mỗi khi cập nhật. Landmarks được cập nhật 60 lần/giây — nếu dùng state, component sẽ render lại 60 lần/giây, gây lag nặng. `useRef` cập nhật giá trị mà không gây re-render.

### Vòng lặp nhận diện:

```typescript
const renderLoop = () => {
  if (!active) return;  // Dừng nếu component unmount

  // Chỉ xử lý khi frame video mới
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;

    // Nhận diện tay trong frame hiện tại
    const results = handLandmarker.detectForVideo(video, Date.now());

    // Cập nhật ref (không gây re-render)
    landmarksRef.current = results.landmarks;

    // Vẽ skeleton lên canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    for (const landmarks of results.landmarks) {
      drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, ...);
      drawingUtils.drawLandmarks(landmarks, ...);
    }
  }

  // Lên lịch frame tiếp theo
  animFrameRef.current = requestAnimationFrame(renderLoop);
};
```

### Cleanup khi component unmount:

```typescript
return () => {
  active = false;                              // Dừng vòng lặp
  cancelAnimationFrame(animFrameRef.current);  // Hủy frame đang chờ
  handLandmarker.close();                      // Giải phóng bộ nhớ GPU
  streamRef.current = null;
  mediaStream.getTracks().forEach(t => t.stop()); // Tắt webcam
};
```

---

## 7. Hook useBoxController — Điều Khiển Box

**File:** `src/hooks/useBoxController.ts`

Hook này điều khiển box (nhân vật) của người chơi local với vật lý thực tế.

### Các hằng số vật lý:

```typescript
const GRAVITY = 1800;       // px/giây² — gia tốc rơi xuống
const JUMP_VELOCITY = -700; // px/giây — vận tốc ban đầu khi nhảy (âm = lên trên)
const LERP_X = 0.15;        // Hệ số làm mượt ngang (0 = đứng im, 1 = tức thì)
const BOX_SIZE = 48;        // Kích thước box (px)
```

### Cơ chế vật lý:

**Trọng lực và nhảy:**

```typescript
// Mỗi frame, nếu đang trên không:
p.vy += GRAVITY * dt;  // Tăng vận tốc rơi xuống
p.y  += p.vy * dt;     // Di chuyển theo vận tốc

// Khi chạm sàn:
if (p.y >= floor) {
  p.y = floor;    // Đặt đúng vào sàn
  p.vy = 0;       // Dừng vận tốc dọc
  p.onFloor = true;
}
```

**Cách tính `dt` (delta time):**

```typescript
const dt = Math.min((ts - lastTimeRef.current) / 1000, 0.05);
```

`dt` là khoảng thời gian (giây) giữa 2 frame. Nhân `dt` vào vận tốc/gia tốc giúp vật lý chạy ổn định dù máy chạy ở 30fps hay 120fps. Giới hạn 0.05 giây (~20fps) tránh box rơi xuyên sàn khi tab bị ẩn.

**Di chuyển ngang (LERP):**

```typescript
// targetX là vị trí lý tưởng dựa trên vị trí cổ tay
const targetX = (1 - wrist[0]) * window.innerWidth - BOX_SIZE / 2;
//                ↑ đảo ngược vì camera bị mirror

// LERP: di chuyển 15% khoảng cách còn lại mỗi frame → chuyển động mượt
p.x += (targetX - p.x) * LERP_X;
```

**LERP (Linear Interpolation)** là kỹ thuật làm mượt: thay vì nhảy thẳng đến đích, mỗi frame di chuyển một tỷ lệ phần trăm nhất định. Tỷ lệ nhỏ = mượt hơn nhưng trễ hơn.

**Trigger nhảy:**

```typescript
const JUMP_TRIGGER_FROM: Gesture = "fist";
const JUMP_TRIGGER_TO = ["thumbs_up", "point"];

// Nếu frame trước là nắm tay, frame này là giơ ngón cái/chỉ → nhảy
if (prevGestureRef.current === "fist" &&
    JUMP_TRIGGER_TO.includes(gesture) &&
    p.onFloor) {
  p.vy = JUMP_VELOCITY;
  p.onFloor = false;
}
```

### Giải quyết vấn đề Stale Closure:

```typescript
const onTickRef = useRef(onTick);
useEffect(() => { onTickRef.current = onTick; }, [onTick]);

// Trong vòng lặp rAF, luôn gọi qua ref để không bao giờ bị stale:
onTickRef.current?.(next);
```

**Stale closure** là lỗi phổ biến trong React: khi một function được tạo bên trong `useEffect`, nó "nhớ" các giá trị tại thời điểm tạo ra. Nếu giá trị đó thay đổi sau, function vẫn dùng giá trị cũ (stale). Dùng `useRef` làm trung gian giải quyết vấn đề này.

---

## 8. Socket.IO — Máy Chủ Tín Hiệu

### Socket.IO là gì?

Socket.IO là thư viện cho phép server và client giao tiếp **thời gian thực** qua WebSocket. Trong Handfight, nó được dùng như một **máy chủ tín hiệu (signaling server)** — chỉ để hai người chơi tìm thấy nhau. Sau khi tìm được, dữ liệu game đi thẳng P2P, không qua server.

### Các sự kiện Socket.IO:

```
Client → Server:
  "room:create"              Tạo phòng mới
  "room:join" { roomCode }   Vào phòng có mã

Server → Client:
  "room:created" { roomCode }        Phòng đã tạo, trả về mã
  "room:ready" { roomCode, initiator } Đủ 2 người, bắt đầu kết nối P2P
  "room:playerLeft"                  Đối thủ đã thoát

Client → Server (P2P signaling):
  "peer:id" { roomCode, peerId }     Chia sẻ PeerJS ID với đối thủ

Server → Client:
  "peer:id" { peerId }               Nhận PeerJS ID của đối thủ
```

### Luồng tạo phòng:

```
Người A nhấn "CREATE ROOM"
  → socket.emit("room:create")
  → Server tạo mã 6 ký tự, lưu phòng
  → socket.emit("room:created", { roomCode: "ABCD12" })
  → Người A hiện mã "ABCD12" trên màn hình

Người B nhập "ABCD12" và nhấn "JOIN"
  → socket.emit("room:join", { roomCode: "ABCD12" })
  → Server kiểm tra phòng tồn tại, đủ 2 người
  → Server gửi "room:ready" cho CẢ HAI với trường "initiator" = socket.id của A
```

---

## 9. PeerJS / WebRTC — Kết Nối P2P

### WebRTC là gì?

WebRTC (Web Real-Time Communication) là công nghệ cho phép **hai trình duyệt kết nối trực tiếp với nhau** — không qua server. Một khi kết nối thiết lập, dữ liệu đi thẳng từ máy A đến máy B với độ trễ rất thấp.

### PeerJS là gì?

PeerJS là thư viện bọc bên ngoài WebRTC, giúp dùng WebRTC dễ hơn rất nhiều. Thay vì xử lý SDP, ICE candidates phức tạp, PeerJS chỉ cần:

```typescript
const peer = new Peer();   // Tạo peer, tự lấy ID ngẫu nhiên
peer.connect(remotePeerId); // Kết nối tới peer khác
peer.call(remotePeerId, localStream); // Gọi video
```

### Hai loại kênh trong WebRTC:

| Kênh | Mục đích | Trong Handfight |
|------|----------|-----------------|
| **Data Channel** | Gửi dữ liệu tùy ý (JSON, binary) | Gửi `FrameData` (~60fps) |
| **Media Channel** | Gửi video/audio stream | Gửi webcam stream |

### Luồng thiết lập kết nối P2P chi tiết:

```
Cả hai nhận được "room:ready"
  → Mỗi người tạo: new Peer()
  → Peer nhận được ID ngẫu nhiên (vd: "abc-123-xyz")
  → Mỗi người gửi qua Socket.IO: socket.emit("peer:id", { roomCode, peerId: "abc-123-xyz" })
  → Server forward "peer:id" đến người kia

Người khởi tạo (A - initiator):
  → Nhận được peerId của B ("def-456-uvw")
  → Thiết lập data channel: peer.connect("def-456-uvw")
  → Gọi video: peer.call("def-456-uvw", localStream)

Người nhận (B):
  → Nhận được sự kiện "connection" → thiết lập data channel
  → Nhận được sự kiện "call" → trả lời: call.answer(localStream)

Cả hai:
  → Data channel "open" → onConnected() được gọi → state = "connected"
  → Media channel "stream" → onRemoteStream(stream) → hiển thị video đối thủ
```

### Vấn đề Race Condition và cách xử lý:

Có thể xảy ra tình huống: Người A nhận được peerId của B **trước khi** Peer của A mở (open). Code xử lý điều này bằng cách lưu remotePeerId vào biến và kiểm tra cả hai điều kiện:

```typescript
// Khi nhận được peerId của đối thủ:
this.remotePeerId = peerId;
this.tryStartOutgoingCall(); // Thử kết nối ngay
if (this.peer?.open) {
  this.setupDataConnection(this.peer.connect(peerId)); // Nếu peer đã open, kết nối luôn
}

// Khi peer mở:
this.peer.on("open", (id) => {
  this.socket.emit("peer:id", { roomCode, peerId: id });
  if (this.isInitiator && this.remotePeerId) { // Nếu đã có peerId của đối thủ, kết nối
    this.setupDataConnection(this.peer.connect(this.remotePeerId));
  }
});
```

---

## 10. NetworkManager — Lớp Mạng Trung Tâm

**File:** `src/network/NetworkManager.ts`

Đây là lớp (class) trung tâm chứa toàn bộ logic mạng. Nó kết hợp Socket.IO và PeerJS vào một nơi.

### Cấu trúc:

```typescript
export class NetworkManager {
  // Kết nối Socket.IO với server
  private socket: Socket;

  // Peer của PeerJS (data + media)
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;

  // Gọi video
  private outgoingCall: MediaConnection | null = null;
  private incomingCall: MediaConnection | null = null;

  // Stream webcam local
  private localStream: MediaStream | null = null;

  // Callbacks — được set bởi useRoomConnection
  onConnected?: () => void;
  onFrameData?: (data: FrameData) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onDisconnected?: () => void;
  onPlayerLeft?: () => void;
}
```

### Pattern Callback:

NetworkManager dùng **callback pattern** thay vì event emitter. Hook `useRoomConnection` gắn các hàm xử lý vào các trường `on...`:

```typescript
// Trong useRoomConnection:
manager.onConnected = () => syncState("connected");
manager.onFrameData = (data) => { remoteFrameRef.current = data; };
manager.onRemoteStream = (stream) => setRemoteStream(stream);
```

### Gửi dữ liệu frame:

```typescript
sendFrame(data: FrameData) {
  if (this.conn?.open) {
    this.conn.send(JSON.stringify(data)); // Serialize thành JSON string
  }
}
```

### Nhận dữ liệu frame:

```typescript
conn.on("data", (raw: unknown) => {
  const data: FrameData = JSON.parse(raw as string); // Deserialize từ JSON
  this.onFrameData?.(data);
});
```

---

## 11. Hook useRoomConnection — Quản Lý Phòng

**File:** `src/hooks/useRoomConnection.ts`

Hook này là cầu nối giữa giao diện React và lớp NetworkManager. Nó quản lý **state machine** của kết nối.

### State Machine:

```
idle
  ↓ createRoom()
creating
  ↓ server trả roomCode
waiting (hiện mã phòng cho người dùng)
  ↓ đối thủ vào phòng, P2P kết nối xong
connected
  ↓ onDisconnected() / onPlayerLeft()
disconnected
  ↓ disconnect() manual / tạo/vào phòng mới
idle
```

```
idle
  ↓ joinRoom(code)
joining
  ↓ P2P kết nối xong
connected
```

### sendFrame — tránh Stale Closure trong rAF:

```typescript
// Vấn đề: sendFrame được gọi bên trong vòng lặp rAF của useBoxController
// rAF closure "nhớ" state tại thời điểm effect chạy → có thể đọc state cũ

// Giải pháp: dùng stateRef làm gương của state
const stateRef = useRef<ConnectionState>("idle");
const syncState = (s: ConnectionState) => {
  stateRef.current = s;  // Cập nhật ref đồng thời
  setState(s);           // Và cập nhật state để trigger re-render
};

const sendFrame = useCallback((boxState: BoxState) => {
  if (stateRef.current !== "connected") return; // Đọc từ ref → luôn mới nhất
  manager.sendFrame({ ... });
}, [manager]);
```

### FrameData — tọa độ chuẩn hóa:

```typescript
manager.sendFrame({
  ts: Date.now(),
  wrist: boxState.wrist,
  gesture: boxState.gesture,
  normX: boxState.x / window.innerWidth,   // 0.0 → 1.0
  normY: boxState.y / window.innerHeight,  // 0.0 → 1.0
});
```

**Tại sao chuẩn hóa?** Người chơi A dùng màn hình 1920px, người chơi B dùng màn hình 1280px. Nếu gửi tọa độ pixel thô, box của A sẽ hiện ngoài màn hình B. Chuẩn hóa về 0-1 rồi nhân với kích thước màn hình của B giải quyết vấn đề này.

---

## 12. Hook useRemoteBox — Hiển Thị Box Đối Thủ

**File:** `src/hooks/useRemoteBox.ts`

Hook này đọc `remoteFrameRef` (cập nhật bởi NetworkManager) và tạo BoxState mượt mà để hiển thị.

```typescript
const tick = () => {
  const frame = remoteFrameRef.current;

  if (frame) {
    // Chuyển tọa độ chuẩn hóa về tọa độ pixel của màn hình người nhận
    const targetX = frame.normX * window.innerWidth;
    const targetY = frame.normY * window.innerHeight;

    // LERP để làm mượt (0.2 = nhanh hơn local một chút)
    posRef.current.x += (targetX - posRef.current.x) * 0.2;
    posRef.current.y += (targetY - posRef.current.y) * 0.2;

    setState({
      x: Math.round(posRef.current.x),
      y: Math.round(posRef.current.y),
      gesture: frame.gesture as Gesture,
      wrist: frame.wrist,
    });
  }

  rafRef.current = requestAnimationFrame(tick);
};
```

**Tại sao LERP cho remote box?** Dữ liệu mạng không đến đều đặn 60fps — có thể có frame bị trễ hoặc mất. LERP giúp chuyển động trông mượt mà dù dữ liệu gián đoạn.

---

## 13. Các Component UI

### LoadingScreen

**File:** `src/components/LoadingScreen.tsx`

Hiện trong khi MediaPipe đang tải (0-99%). Nhận prop `percent` và vẽ thanh tiến trình.

```
HAND FIGHT
SPRITE EDITION
[████████░░░░░░░░] 60%
Đang khởi động... 60%
```

### LobbyScreen

**File:** `src/components/LobbyScreen.tsx`

Màn hình chính trước khi vào phòng. Có hai action:

- **CREATE ROOM**: Gọi `onCreateRoom()` (async), nút bị disable trong khi đang tạo
- **JOIN**: Nhập mã phòng rồi gọi `onJoinRoom(code)`

Prop `disconnected` hiện banner "⚡ OPPONENT DISCONNECTED" khi đối thủ thoát giữa game.

### WaitingScreen

**File:** `src/components/WaitingScreen.tsx`

Hiện trong khi chờ kết nối. Nội dung thay đổi theo `state`:

| State | Nội dung |
|-------|---------|
| `creating` | "CREATING ROOM…" |
| `waiting` | "WAITING FOR OPPONENT" + mã phòng lớn để share |
| `joining` | "CONNECTING…" |

### BoxEntity

**File:** `src/components/BoxEntity.tsx`

Component box nhân vật. Nhận vị trí `x`, `y`, `gesture`, và `player` ("local"/"remote").

```typescript
// Local: màu thay đổi theo cử chỉ
fist  → đỏ ✊
open  → xanh dương 🖐
point → vàng ☝

// Remote: luôn xanh dương nhạt (bg-blue-dim)
```

Box được đặt `position: fixed` với `pointer-events: none` để nó nổi trên tất cả nội dung và không chặn click.

### HandCamOverlay

**File:** `src/components/HandCamOverlay.tsx`

Preview webcam + skeleton tay ở góc dưới phải. Luôn tồn tại trong DOM (không bị conditional render), chỉ ẩn qua CSS khi `show=false`.

**Tại sao không dùng conditional rendering?** Nếu dùng `{show && <HandCamOverlay>}`, khi `show=false`, thẻ `<video>` và `<canvas>` sẽ không tồn tại trong DOM. Nhưng `videoRef` và `canvasRef` của `useHandTracking` cần được gắn vào DOM elements ngay từ đầu. Nếu không gắn được, MediaPipe không chạy được.

### RemoteVideo

**File:** `src/components/RemoteVideo.tsx`

Video webcam của đối thủ ở góc dưới trái. Khi `stream` thay đổi, `useEffect` gắn stream vào `video.srcObject`.

---

## 14. Trang Home — Điểm Kết Hợp

**File:** `src/pages/Home.tsx`

Đây là component "nhạc trưởng" — không có logic riêng, chỉ kết hợp tất cả hook và component lại.

```typescript
const Home = () => {
  // 1. Nhận diện tay
  const { videoRef, canvasRef, loadingPercent, landmarksRef, streamRef } =
    useHandTracking();

  // 2. Kết nối phòng (nhận sendFrame để truyền vào boxController)
  const { state, roomCode, remoteStream, remoteFrameRef, sendFrame,
    createRoom, joinRoom, disconnect } = useRoomConnection(streamRef);

  // 3. Điều khiển box local (nhận landmarks, gửi frame mỗi tick)
  const localBox  = useBoxController(landmarksRef, sendFrame);

  // 4. Box đối thủ (đọc frame từ mạng)
  const remoteBox = useRemoteBox(remoteFrameRef);

  // 5. Tính trạng thái màn hình
  const isReady     = loadingPercent === 100;
  const isConnected = state === "connected";
  const isInLobby   = isReady && (state === "idle" || state === "disconnected");
  const isWaiting   = isReady && (state === "creating" || state === "waiting" || state === "joining");

  return (
    <>
      {/* Các màn hình overlay — được render vào giữa màn hình bởi DefaultLayout */}
      {!isReady  && <LoadingScreen percent={loadingPercent} />}
      {isInLobby && <LobbyScreen onCreateRoom={createRoom} onJoinRoom={joinRoom} ... />}
      {isWaiting && <WaitingScreen state={state} roomCode={roomCode} onCancel={disconnect} />}

      {/* Box của bạn — luôn hiển thị */}
      <BoxEntity x={localBox.x} y={localBox.y} gesture={localBox.gesture} player="local" />

      {/* Box đối thủ — chỉ hiện khi connected */}
      {isConnected && <BoxEntity x={remoteBox.x} y={remoteBox.y} gesture={remoteBox.gesture} player="remote" />}

      {/* Webcam preview góc dưới phải — luôn mounted */}
      <HandCamOverlay videoRef={videoRef} canvasRef={canvasRef} gesture={localBox.gesture} show={isReady} />

      {/* Video đối thủ góc dưới trái — chỉ khi connected */}
      {isConnected && remoteStream && <RemoteVideo stream={remoteStream} />}
    </>
  );
};
```

---

## 15. Kiến Trúc SOLID

Dự án được thiết kế theo nguyên tắc SOLID. Đây là cách mỗi nguyên tắc được áp dụng:

### S — Single Responsibility (Một trách nhiệm)

Mỗi file chỉ làm một việc:
- `useHandTracking` → chỉ quản lý camera và MediaPipe
- `useBoxController` → chỉ tính toán vật lý box
- `NetworkManager` → chỉ xử lý mạng
- `BoxEntity` → chỉ hiển thị một box

### O — Open/Closed (Mở để mở rộng, đóng để sửa đổi)

Các bảng const map cho phép thêm gesture mới mà không cần sửa logic chính:

```typescript
// Thêm gesture mới? Chỉ cần thêm vào map này:
const GESTURE_STYLE: Partial<Record<Gesture, GestureStyle>> = {
  fist: { bg: "bg-red", ... },
  open: { bg: "bg-blue", ... },
  // thêm dòng mới ở đây
};
```

### L — Liskov Substitution (Có thể thay thế)

`sendFrame` được truyền vào `useBoxController` như một callback — hook không cần biết ai gọi hay làm gì với dữ liệu, chỉ cần gọi callback mỗi tick.

### I — Interface Segregation (Phân tách interface)

`FrameData` chỉ chứa đúng những gì cần truyền qua mạng. Không chứa thêm thứ gì của component.

### D — Dependency Inversion (Đảo ngược phụ thuộc)

`Home.tsx` phụ thuộc vào abstraction (các hook interface), không phụ thuộc trực tiếp vào MediaPipe hay PeerJS. Các hook cũng giao tiếp qua ref interface thay vì coupling trực tiếp.

---

## 16. Các Khái Niệm Quan Trọng

### requestAnimationFrame (rAF)

```javascript
const loop = (timestamp) => {
  // làm gì đó
  requestAnimationFrame(loop); // lên lịch frame tiếp theo
};
requestAnimationFrame(loop); // bắt đầu
```

Trình duyệt sẽ gọi `loop` ngay trước mỗi lần vẽ màn hình (~60fps). Đây là cách chuẩn để làm game loop và animation.

### useRef vs useState

| | `useState` | `useRef` |
|---|------------|----------|
| Khi giá trị thay đổi | Component re-render | Không re-render |
| Đọc trong async/closure | Có thể stale | Luôn mới nhất |
| Dùng cho | Dữ liệu hiển thị UI | Dữ liệu nội bộ, DOM refs |

### LERP (Linear Interpolation)

```javascript
// Công thức: current += (target - current) * factor
// factor = 0.15 → di chuyển 15% khoảng cách còn lại mỗi frame

// Frame 1: current=0, target=100 → current = 0 + (100-0)*0.15 = 15
// Frame 2: current=15, target=100 → current = 15 + (100-15)*0.15 = 27.75
// Frame 3: ...tiếp tục tiến gần target
```

Kết quả: chuyển động mượt mà, giảm tốc khi đến gần đích.

### P2P vs Server-Client

```
Server-Client (truyền thống):
  A → Server → B     (dữ liệu đi qua server, thêm độ trễ)

P2P (WebRTC):
  A ↔ B              (dữ liệu đi thẳng, độ trễ thấp nhất)
  Server chỉ cần ở bước đầu để A và B tìm thấy nhau (signaling)
```

### React Context

React Context là cách chia sẻ dữ liệu cho tất cả component con mà không cần truyền props qua từng tầng.

```typescript
// NetworkManagerProvider bọc toàn bộ app
// → bất kỳ component nào cũng có thể gọi useNetworkManager() để lấy instance
const manager = useNetworkManager();
```

---

*Tài liệu này phản ánh trạng thái code tại thời điểm commit `c11a744`. Khi code thay đổi, một số chi tiết có thể không còn chính xác.*
