import { Link } from "react-router-dom";
import { useSystem } from "../lib/system";
import { fmtBytes } from "../lib/types";

export default function Overview() {
  const { info, uptimeDisplay } = useSystem();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-mono text-lg tracking-widest text-sao-accent">OVERVIEW</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Agents Online"
          value={`${info.agents_online} / ${info.agents_total}`}
        />
        <StatCard label="Keys Active" value={String(info.keys_active)} to="/keys" />
        <StatCard
          label="DB Size"
          value={info.db_size_bytes > 0 ? fmtBytes(info.db_size_bytes) : "—"}
        />
        <StatCard label="Uptime" value={uptimeDisplay} />
      </div>
    </div>
  );
}

function StatCard({ label, value, to }: { label: string; value: string; to?: string }) {
  const card = (
    <div
      className={`flex flex-col gap-2 rounded-lg border bg-sao-panel/60 p-5 ${
        to
          ? "border-sao-accent/20 transition-colors hover:border-sao-accent/50"
          : "border-sao-accent/20"
      }`}
    >
      <span className="font-mono text-xs text-slate-500">{label}</span>
      <span className="font-mono text-2xl text-sao-accent">{value}</span>
    </div>
  );
  if (!to) return card;
  return (
    <Link to={to} className="block">
      {card}
    </Link>
  );
}
