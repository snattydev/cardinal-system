import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(user, password);
      navigate("/", { replace: true });
    } catch {
      setError("invalid credentials");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <form
        onSubmit={onSubmit}
        className="flex w-80 flex-col gap-4 rounded-lg border border-sao-accent/30 bg-sao-panel/70 p-8 shadow-[0_0_40px_rgba(0,212,255,0.15)]"
      >
        <h1 className="text-center font-mono text-xl tracking-widest text-sao-accent">CARDINAL</h1>
        <input
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="user"
          autoComplete="username"
          className="rounded border border-sao-accent/20 bg-sao-bg px-3 py-2 font-mono text-sm outline-none focus:border-sao-accent"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          autoComplete="current-password"
          className="rounded border border-sao-accent/20 bg-sao-bg px-3 py-2 font-mono text-sm outline-none focus:border-sao-accent"
        />
        {error && <p className="font-mono text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded border border-sao-accent bg-sao-accent/10 px-3 py-2 font-mono text-sm tracking-widest text-sao-accent transition-colors hover:bg-sao-accent/20 disabled:opacity-50"
        >
          link start
        </button>
      </form>
    </div>
  );
}
