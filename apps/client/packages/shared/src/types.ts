// Dữ liệu gửi qua WebRTC mỗi frame (~60 bytes)
export interface FrameData {
  ts: number;
  wrist: [number, number]; // normalized wrist [x, y] in image space
  gesture: string;         // Gesture value from handPose utils
  normX: number;           // box x normalised to sender's viewport width  (0-1)
  normY: number;           // box y normalised to sender's viewport height (0-1)
  hp: number;              // sender's current HP — receiver uses to detect win
}

// Signaling messages qua Socket.io
export interface RoomJoinPayload {
  roomCode: string;
}
export interface RoomStatePayload {
  roomCode: string;
  playerCount: 1 | 2;
}
export interface SignalPayload {
  roomCode: string;
  signal: unknown;
}
