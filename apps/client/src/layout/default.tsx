import { Outlet } from "react-router";

const DefaultLayout = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-4 bg-bg font-mono text-text">
      <Outlet />
    </div>
  );
};

export default DefaultLayout;
