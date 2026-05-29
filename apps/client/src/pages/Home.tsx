import { useHandTracking }    from "../hooks/useHandTracking";
import { usePlayerInput }     from "../hooks/usePlayerInput";
import { useRoomConnection }  from "../hooks/useRoomConnection";
import { LoadingScreen }      from "../components/LoadingScreen";
import { LobbyScreen }        from "../components/LobbyScreen";
import { WaitingScreen }      from "../components/WaitingScreen";
import { HandCamOverlay }     from "../components/HandCamOverlay";
import { RemoteVideo }        from "../components/RemoteVideo";
import { PhaserGame }         from "../game/PhaserGame";

const Home = () => {
  const { videoRef, canvasRef, loadingPercent, landmarksRef, streamRef } =
    useHandTracking();

  const { state, roomCode, remoteStream, remoteFrameRef, sendFrame,
    createRoom, joinRoom, disconnect } = useRoomConnection(streamRef);

  const { input, inputRef } = usePlayerInput(landmarksRef);

  const isReady     = loadingPercent === 100;
  const isConnected = state === "connected";
  const isInLobby   = isReady && (state === "idle" || state === "disconnected");
  const isWaiting   = isReady && (state === "creating" || state === "waiting" || state === "joining");

  return (
    <>
      {/* ── Phaser game canvas (always mounted so refs stay valid) ── */}
      <PhaserGame
        localInputRef={inputRef}
        remoteFrameRef={remoteFrameRef}
        onSendFrame={sendFrame}
        isConnected={isConnected}
      />

      {/* ── Overlay screens (centered by DefaultLayout) ── */}
      {!isReady  && <LoadingScreen percent={loadingPercent} />}
      {isInLobby && (
        <LobbyScreen
          onCreateRoom={createRoom}
          onJoinRoom={joinRoom}
          disconnected={state === "disconnected"}
        />
      )}
      {isWaiting && (
        <WaitingScreen state={state} roomCode={roomCode} onCancel={disconnect} />
      )}

      {/* ── Fixed UI layers ── */}
      <HandCamOverlay
        videoRef={videoRef}
        canvasRef={canvasRef}
        gesture={input.gesture}
        show={isReady}
      />

      {isConnected && remoteStream && (
        <RemoteVideo stream={remoteStream} />
      )}
    </>
  );
};

export default Home;
