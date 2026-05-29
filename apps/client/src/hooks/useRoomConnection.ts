import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { FrameData } from "../../packages/shared/src/types";
import { useNetworkManager } from "../context/networkManager";
import type { BoxState } from "./useBoxController";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConnectionState =
  | "idle"
  | "creating"     // waiting for server to return room code
  | "waiting"      // room created, showing code, waiting for opponent
  | "joining"      // join request sent, waiting for room:ready
  | "connected"
  | "disconnected";

export interface RoomConnection {
  state: ConnectionState;
  roomCode: string | null;
  remoteStream: MediaStream | null;
  remoteFrameRef: MutableRefObject<FrameData | null>;
  /** Pass as onTick to useBoxController — sends frame data only when connected. */
  sendFrame: (boxState: BoxState) => void;
  createRoom: () => Promise<void>;
  joinRoom: (code: string) => void;
  disconnect: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Manages the full lifecycle: idle → lobby → waiting/joining → connected.
 *
 * @param streamRef  Live MediaStream ref from useHandTracking — shared with
 *                   the remote peer as soon as a connection is established.
 */
export function useRoomConnection(
  streamRef: MutableRefObject<MediaStream | null>,
): RoomConnection {
  const manager = useNetworkManager();
  const [state, setState] = useState<ConnectionState>("idle");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const remoteFrameRef = useRef<FrameData | null>(null);
  // Mirror state in a ref so sendFrame (called inside rAF) is never stale.
  const stateRef = useRef<ConnectionState>("idle");
  const syncState = (s: ConnectionState) => {
    stateRef.current = s;
    setState(s);
  };

  // ── Wire NetworkManager callbacks ─────────────────────────────────────────
  useEffect(() => {
    manager.onConnected = () => {
      // Share local camera stream for video channel as soon as data channel opens.
      if (streamRef.current) manager.setLocalStream(streamRef.current);
      syncState("connected");
    };

    manager.onFrameData = (data) => {
      remoteFrameRef.current = data;
    };

    manager.onRemoteStream = (stream) => {
      setRemoteStream(stream);
    };

    manager.onDisconnected = () => syncState("disconnected");
    manager.onPlayerLeft = () => syncState("disconnected");

    return () => {
      manager.onConnected = undefined;
      manager.onFrameData = undefined;
      manager.onRemoteStream = undefined;
      manager.onDisconnected = undefined;
      manager.onPlayerLeft = undefined;
    };
  }, [manager, streamRef]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const shareStream = () => {
    if (streamRef.current) manager.setLocalStream(streamRef.current);
  };

  const createRoom = async () => {
    syncState("creating");
    const code = await manager.createRoom();
    setRoomCode(code);
    syncState("waiting");
    shareStream();
  };

  const joinRoom = (code: string) => {
    syncState("joining");
    manager.joinRoom(code);
    shareStream();
  };

  const disconnect = () => {
    manager.disconnect();
    setRoomCode(null);
    setRemoteStream(null);
    remoteFrameRef.current = null;
    syncState("idle");
  };

  // ── sendFrame (onTick callback for useBoxController) ─────────────────────
  const sendFrame = useCallback(
    (boxState: BoxState) => {
      if (stateRef.current !== "connected") return;
      manager.sendFrame({
        ts: Date.now(),
        wrist: boxState.wrist,
        gesture: boxState.gesture,
        normX: boxState.x / window.innerWidth,
        normY: boxState.y / window.innerHeight,
      });
    },
    [manager],
  );

  return {
    state,
    roomCode,
    remoteStream,
    remoteFrameRef,
    sendFrame,
    createRoom,
    joinRoom,
    disconnect,
  };
}
