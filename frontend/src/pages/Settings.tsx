import { useSystem } from "../lib/system";
import { fmtBytes } from "../lib/types";

export default function Settings() {
  const { info, uptimeDisplay } = useSystem();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-mono text-lg tracking-widest text-sao-accent">SETTINGS</h1>

      <Section title="SYSTEM">
        <Row label="version" value={`v${info.version}`} />
        <Row label="uptime" value={uptimeDisplay} />
        <Row label="db_size" value={fmtBytes(info.db_size_bytes)} />
      </Section>

      <Section title="AGENTS">
        <Row label="total" value={String(info.agents_total)} />
        <Row label="online" value={String(info.agents_online)} />
      </Section>

      <Section title="AGENT KEYS">
        <Row label="active" value={String(info.keys_active)} />
        <Row label="revoked" value={String(info.keys_revoked)} />
      </Section>

      <Section title="API KEYS MANAGEMENT">
        <p className="font-mono text-xs italic text-slate-600">coming in Fase 2</p>
      </Section>

      <Section title="MODEL ROUTER">
        <p className="font-mono text-xs italic text-slate-600">coming in Fase 2</p>
      </Section>

      <p className="font-mono text-xs text-slate-600">
        admin credentials in env vars (ADMIN_PASSWORD_HASH)
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex w-96 max-w-full flex-col gap-3 rounded-lg border border-sao-accent/20 bg-sao-panel/60 p-6">
      <h2 className="font-mono text-xs tracking-widest text-sao-accent">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between font-mono text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-sao-accent">{value}</span>
    </div>
  );
}
