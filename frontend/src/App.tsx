import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Agents from "./pages/Agents";
import AgentDetail from "./pages/AgentDetail";
import Settings from "./pages/Settings";
import Keys from "./pages/Keys";
import Tasks from "./pages/Tasks";
import Router from "./pages/Router";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Overview />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/agents/:name" element={<AgentDetail />} />
            <Route path="/keys" element={<Keys />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/router" element={<Router />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
