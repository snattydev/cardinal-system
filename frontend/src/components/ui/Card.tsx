import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "interactive";
  glow?: "none" | "aincrad" | "sinon" | "underworld" | "slash";
  children: React.ReactNode;
}

export function Card({
  variant = "default",
  glow = "none",
  className = "",
  children,
  ...props
}: CardProps) {
  const baseClass =
    variant === "elevated"
      ? "sao-panel-elevated"
      : "sao-panel";

  const interactiveClass =
    variant === "interactive"
      ? "transition-all duration-150 hover:border-sao-aincrad/40 hover:bg-sao-elevated cursor-pointer"
      : "";

  const glowStyles = {
    none: "",
    aincrad: "shadow-[0_0_20px_rgba(255,122,0,0.12)] border-sao-aincrad/30",
    sinon: "shadow-[0_0_20px_rgba(0,240,255,0.12)] border-sao-sinon/30",
    underworld: "shadow-[0_0_20px_rgba(138,63,252,0.12)] border-sao-underworld/30",
    slash: "shadow-[0_0_20px_rgba(255,42,77,0.15)] border-sao-slash-red/40",
  }[glow];

  return (
    <div
      className={`${baseClass} ${interactiveClass} ${glowStyles} p-4 text-sao-text ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  action,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between border-b border-white/5 pb-3 mb-4 font-mono text-sm tracking-wide ${className}`}
    >
      <span className="font-semibold text-sao-text uppercase flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-sao-aincrad inline-block"></span>
        {title}
      </span>
      {action && <div>{action}</div>}
    </div>
  );
}
