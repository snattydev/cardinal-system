import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Card, Input, Button } from "../components/ui";

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
      setError("Invalid credentials");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-sao-obsidian px-4">
      <Card
        glow="sinon"
        className="w-full max-w-sm p-8 border-sao-sinon/30 shadow-[0_0_50px_rgba(0,240,255,0.12)]"
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-1 mb-2">
            <div className="flex items-center gap-2 font-mono text-xl tracking-[0.25em] text-sao-text font-bold">
              <span className="w-2.5 h-2.5 bg-sao-aincrad shadow-[0_0_10px_#FF7A00]"></span>
              CARDINAL
            </div>
            <span className="font-mono text-[10px] tracking-widest text-sao-muted uppercase">
              System Authentication
            </span>
          </div>

          <div className="flex flex-col gap-3">
            <Input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="Username"
              autoComplete="username"
              accent="sinon"
              hasError={Boolean(error)}
              autoFocus
            />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              accent="sinon"
              hasError={Boolean(error)}
            />
          </div>

          {error && (
            <div className="border border-sao-slash-red/40 bg-[rgba(255,42,77,0.08)] px-3 py-2 font-mono text-xs text-sao-slash-red text-center">
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={busy}
            className="w-full uppercase tracking-[0.2em] font-bold mt-1"
          >
            Link Start
          </Button>
        </form>
      </Card>
    </div>
  );
}
