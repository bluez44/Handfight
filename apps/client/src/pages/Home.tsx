import { useHandTracking } from "../hooks/useHandTracking";
import { useBoxController } from "../hooks/useBoxController";
import { useRoomConnection } from "../hooks/useRoomConnection";
import { useRemoteBox } from "../hooks/useRemoteBox";
import { LoadingScreen } from "../components/LoadingScreen";
import { LobbyScreen } from "../components/LobbyScreen";
import { WaitingScreen } from "../components/WaitingScreen";
import { BoxEntity } from "../components/BoxEntity";
import { HandCamOverlay } from "../components/HandCamOverlay";
import { RemoteVideo } from "../components/RemoteVideo";

const Home = () => {
  const { videoRef, canvasRef, loadingPercent, landmarksRef, streamRef } =
    useHandTracking();

  const { state, roomCode, remoteStream, remoteFrameRef, sendFrame,
    createRoom, joinRoom, disconnect } = useRoomConnection(streamRef);

  const localBox  = useBoxController(landmarksRef, sendFrame);
  const remoteBox = useRemoteBox(remoteFrameRef);

  const isReady     = loadingPercent === 100;
  const isConnected = state === "connected";
  const isInLobby   = isReady && (state === "idle" || state === "disconnected");
  const isWaiting   = isReady && (state === "creating" || state === "waiting" || state === "joining");

  return (
    <>
      {/* ── Centered overlay screens (handled by DefaultLayout) ── */}
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

      {/* ── Fixed game layer — always mounted so refs stay valid ── */}

      {/* Local player box */}
      <BoxEntity
        x={localBox.x}
        y={localBox.y}
        gesture={localBox.gesture}
        player="local"
      />

      {/* Remote player box — only visible when connected */}
      {isConnected && (
        <BoxEntity
          x={remoteBox.x}
          y={remoteBox.y}
          gesture={remoteBox.gesture}
          player="remote"
        />
      )}

      {/* Local camera preview + gesture label (bottom-right) */}
      <HandCamOverlay
        videoRef={videoRef}
        canvasRef={canvasRef}
        gesture={localBox.gesture}
        show={isReady}
      />

      {/* Remote camera preview (bottom-left) */}
      {isConnected && remoteStream && (
        <RemoteVideo stream={remoteStream} />
      )}
    </>
  );
};

export default Home;
