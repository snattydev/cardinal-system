import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function ProtectedRoute() {
  const { user } = useAuth();

  if (user === undefined) {
    return (
      <div className="flex h-screen items-center justify-center">
        <span className="font-mono text-sm text-sao-accent animate-pulse">loading…</span>
      </div>
    );
  }
  if (user === null) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
