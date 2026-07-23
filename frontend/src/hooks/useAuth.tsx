import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api";

interface AuthContextValue {
  user: string | null | undefined; // undefined = loading
  login: (user: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    api<{ user: string }>("/api/auth/me")
      .then((res) => setUser(res.user))
      .catch((err) => {
        if (err instanceof ApiError) {
          setUser(null);
        } else {
          setUser(null);
        }
      });
  }, []);

  async function login(user: string, password: string) {
    const res = await api<{ user: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ user, password }),
    });
    setUser(res.user);
  }

  async function logout() {
    try {
      await api<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore logout errors
    }
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
