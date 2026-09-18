import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "sinon" | "aincrad" | "underworld" | "slash" | "neutral";
  size?: "sm" | "md";
  dot?: boolean;
  children: React.ReactNode;
}

export function Badge({
  variant = "neutral",
  size = "sm",
  dot = false,
  className = "",
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    sinon: "bg-[rgba(0,240,255,0.08)] text-sao-sinon border border-sao-sinon/30",
    aincrad: "bg-[rgba(255,122,0,0.08)] text-sao-aincrad border border-sao-aincrad/30",
    underworld: "bg-[rgba(138,63,252,0.08)] text-sao-underworld border border-sao-underworld/30",
    slash: "bg-[rgba(255,42,77,0.12)] text-sao-slash-red border border-sao-slash-red/40",
    neutral: "bg-white/5 text-sao-muted border border-white/10",
  }[variant];

  const dotStyles = {
    sinon: "bg-sao-sinon",
    aincrad: "bg-sao-aincrad",
    underworld: "bg-sao-underworld",
    slash: "bg-sao-slash-red",
    neutral: "bg-sao-muted",
  }[variant];

  const sizeStyles = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
  }[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono uppercase tracking-wider rounded-[1px] ${variantStyles} ${sizeStyles} ${className}`}
      {...props}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotStyles}`}></span>}
      {children}
    </span>
  );
}
