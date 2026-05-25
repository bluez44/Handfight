import { useRef, useState } from "react";
import "./App.css";
import { NetworkManager } from "./network/NetworkManager";

function App() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const net = useRef<NetworkManager | null>(null);

  const handleCreateRoom = async () => {
    const manager = new NetworkManager("http://localhost:3000");
    net.current = manager;
    const code = await manager.createRoom();

    if (code) setRoomCode(code);

    console.log("Room code:", code);

    manager.onConnected = () => {
      console.log("Connected to peer!");
    };

    manager.onFrameData = (data) => {
      console.log("Received frame data:", data);
    };

    manager.onDisconnected = () => {
      console.log("Peer disconnected!");
    };
  };

  const handleJoinRoom = (code: string) => {
    const manager = new NetworkManager("http://localhost:3000");
    net.current = manager;

    manager.onConnected = () => console.log("Connected to peer!");
    manager.onFrameData = (data) => console.log("Received frame data:", data);
    manager.onDisconnected = () => console.log("Peer disconnected!");

    manager.joinRoom(code);
  };

  const handleSendData = (data: string) => {
    console.log("Sending data:", data, net.current);
    if (!net.current) return;
    console.log("Sending frame data:", {
      ts: Date.now(),
      wrist: [Math.random(), Math.random()],
      gesture: "punch",
    });
    net.current.sendFrame({
      ts: Date.now(),
      wrist: [Math.random(), Math.random()],
      gesture: "punch",
    });
  }

  return (
    <>
      {roomCode && <p>Room Code: {roomCode}</p>}
      {!roomCode && <button onClick={handleCreateRoom}>Create Room</button>}

      <input
        type="text"
        placeholder="Enter room code"
        onKeyDown={(e) => {
          if (e.key === "Enter") handleJoinRoom(e.currentTarget.value);
        }}
      />

      <input
        type="text"
        placeholder="Data"
        onChange={(e) => handleSendData(e.currentTarget.value)}
      />
    </>
  );
}

export default App;
