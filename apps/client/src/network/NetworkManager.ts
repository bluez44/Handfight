import { io, Socket } from "socket.io-client";
import Peer from "peerjs";
import type { FrameData } from "../../packages/shared/src/types";

export class NetworkManager {
  private socket: Socket;
  private peer: Peer | null = null;
  private conn: any | null = null;
  private serverUrl: string;
  private roomCode: string | null = null;
  private isInitiator = false;
  private remotePeerId: string | null = null;

  onConnected?: () => void;
  onFrameData?: (data: FrameData) => void;
  onDisconnected?: () => void;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
    this.socket = io(this.serverUrl);
    this.setupSocketListeners();
  }

  createRoom(): Promise<string> {
    return new Promise((resolve) => {
      this.socket.emit("room:create");
      this.socket.once("room:created", ({ roomCode }) => resolve(roomCode));
    });
  }

  joinRoom(roomCode: string) {
    this.socket.emit("room:join", { roomCode });
  }

  private setupSocketListeners() {
    this.socket.on("room:ready", ({ roomCode, initiator }) => {
      this.roomCode = roomCode;
      this.isInitiator = initiator === this.socket.id;
      this.initPeer();
    });

    // Receive the remote player's PeerJS ID — only the initiator connects
    this.socket.on("peer:id", ({ peerId }: { peerId: string }) => {
      if (!this.isInitiator) return;
      this.remotePeerId = peerId;
      // Connect now if our Peer is already open; otherwise the open handler will do it
      if (this.peer?.open) {
        this.setupDataConnection(this.peer.connect(peerId));
      }
    });
  }

  private initPeer() {
    this.peer = new Peer();

    this.peer.on("open", (id) => {
      console.log("[P2P] My peer ID:", id);
      // Broadcast our PeerJS ID to the other player via the signaling server
      this.socket.emit("peer:id", { roomCode: this.roomCode, peerId: id });
      // Handle race condition: initiator received remote ID before peer opened
      if (this.isInitiator && this.remotePeerId) {
        this.setupDataConnection(this.peer!.connect(this.remotePeerId));
      }
    });

    // Receiver waits for the initiator to connect
    if (!this.isInitiator) {
      this.peer.on("connection", (conn) => {
        this.setupDataConnection(conn);
      });
    }

    this.peer.on("error", (err) => console.error("[P2P]", err));
  }

  private setupDataConnection(conn: any) {
    this.conn = conn;

    conn.on("open", () => {
      console.log("[P2P] Data channel open!");
      this.onConnected?.();
    });

    conn.on("data", (raw) => {
      const data: FrameData = JSON.parse(raw as string);
      this.onFrameData?.(data);
    });

    conn.on("close", () => this.onDisconnected?.());
    conn.on("error", (err) => console.error("[P2P] conn:", err));
  }

  sendFrame(data: FrameData) {
    if (this.conn?.open) {
      this.conn.send(JSON.stringify(data));
    }
  }

  disconnect() {
    this.peer?.destroy();
    this.socket.disconnect();
  }
}
