import { Link } from "react-router-dom";
import { useSystem } from "../lib/system";
import { fmtBytes } from "../lib/types";
import { Card } from "../components/ui";

export default function Overview() {
  const { info, uptimeDisplay } = useSystem();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 border-b border-white/5 pb-4 font-mono text-lg tracking-widest text-sao-text">
        <span className="w-2 h-2 bg-sao-aincrad shadow-[0_0_8px_#FF7A00]"></span>
        <span>SYSTEM OVERVIEW</span>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Agents Online"
          value={`${info.agents_online} / ${info.agents_total}`}
          glow="sinon"
        />
        <StatCard
          label="Keys Active"
          value={String(info.keys_active)}
          to="/keys"
          glow="underworld"
        />
        <StatCard
          label="DB Size"
          value={info.db_size_bytes > 0 ? fmtBytes(info.db_size_bytes) : "—"}
        />
        <StatCard label="Uptime" value={uptimeDisplay} />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  to,
  glow = "none",
}: {
  label: string;
  value: string;
  to?: string;
  glow?: "none" | "sinon" | "aincrad" | "underworld" | "slash";
}) {
  const content = (
    <Card
      variant={to ? "interactive" : "default"}
      glow={glow}
      className="flex flex-col gap-2 p-5"
    >
      <span className="font-mono text-xs uppercase tracking-wider text-sao-muted">
        {label}
      </span>
      <span className="font-mono text-2xl font-semibold tracking-tight text-sao-sinon">
        {value}
      </span>
    </Card>
  );

  if (!to) return content;
  return (
    <Link to={to} className="block">
      {content}
    </Link>
  );
}
