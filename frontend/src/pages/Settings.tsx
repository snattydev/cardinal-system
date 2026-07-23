import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

export default function Settings() {
  const { user } = useAuth();
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    api<{ version: string }>("/api/health")
      .then((res) => setVersion(res.version))
      .catch(() => setVersion(""));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-mono text-lg tracking-widest text-sao-accent">SETTINGS</h1>
      <div className="flex w-96 flex-col gap-3 rounded-lg border border-sao-accent/20 bg-sao-panel/60 p-6">
        <div className="flex justify-between font-mono text-sm">
          <span className="text-slate-400">user</span>
          <span className="text-sao-accent">{user}</span>
        </div>
        <div className="flex justify-between font-mono text-sm">
          <span className="text-slate-400">version</span>
          <span className="text-sao-accent">v{version}</span>
        </div>
        <p className="mt-2 border-t border-sao-accent/10 pt-3 font-mono text-xs text-slate-500">
          admin credentials live in env vars — change ADMIN_PASSWORD_HASH and restart the service.
        </p>
      </div>
    </div>
  );
}
