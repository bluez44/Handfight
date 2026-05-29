import { BrowserRouter as Router, Routes, Route } from "react-router";
import Home from "./pages/Home";
import DefaultLayout from "./layout/default";
import NetworkManagerProvider from "./context/networkManager";

function App() {
  return (
    <NetworkManagerProvider>
      <Router>
        <Routes>
          <Route element={<DefaultLayout />}>
            <Route path="/" element={<Home />} />
          </Route>
          <Route path="*" element={<div>404 Not Found</div>} />
        </Routes>
      </Router>
    </NetworkManagerProvider>
  );
}

export default App;
