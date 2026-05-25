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