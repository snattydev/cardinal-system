import React from "react";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  accent?: "sinon" | "aincrad";
  hasError?: boolean;
}

export function Input({
  accent = "sinon",
  hasError = false,
  className = "",
  disabled,
  ...props
}: InputProps) {
  const accentFocusStyles = {
    sinon: "focus:border-sao-sinon/60 focus:shadow-[0_0_12px_rgba(0,240,255,0.15)]",
    aincrad: "focus:border-sao-aincrad/60 focus:shadow-[0_0_12px_rgba(255,122,0,0.15)]",
  }[accent];

  const errorStyles = hasError
    ? "border-sao-slash-red/50 text-sao-slash-red shadow-[0_0_10px_rgba(255,42,77,0.15)]"
    : "border-white/10 text-sao-text";

  return (
    <input
      className={`rounded-[2px] border bg-sao-obsidian px-3 py-2 font-mono text-sm tracking-wide placeholder-sao-dim transition-all duration-150 outline-none disabled:opacity-40 disabled:cursor-not-allowed ${errorStyles} ${accentFocusStyles} ${className}`}
      disabled={disabled}
      {...props}
    />
  );
}
