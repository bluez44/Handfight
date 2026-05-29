import { createContext, useContext, useEffect, useState } from "react";
import { NetworkManager } from "../network/NetworkManager";

export const NetworkManagerContext = createContext<NetworkManager | null>(null);

const NetworkManagerProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [networkManager] = useState<NetworkManager>(
    () =>
      new NetworkManager(
        import.meta.env.VITE_API_URL || "http://localhost:3000",
      ),
  );

  useEffect(() => {
    return () => {
      networkManager.disconnect();
    };
  }, [networkManager]);

  return (
    <NetworkManagerContext.Provider value={networkManager}>
      {children}
    </NetworkManagerContext.Provider>
  );
};

export const useNetworkManager = () => {
  const context = useContext(NetworkManagerContext);
  if (!context) {
    throw new Error(
      "useNetworkManager must be used within a NetworkManagerProvider",
    );
  }
  return context;
};

export default NetworkManagerProvider;
