import React from "react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center font-mono font-medium tracking-wide transition-all duration-150 rounded-[2px] disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none";

  const sizeStyles = {
    sm: "text-xs px-2.5 py-1 gap-1.5",
    md: "text-sm px-4 py-2 gap-2",
    lg: "text-base px-5 py-2.5 gap-2.5",
  }[size];

  const variantStyles = {
    primary:
      "bg-sao-aincrad text-black font-semibold hover:bg-[#ff9426] active:bg-[#e06c00] shadow-[0_0_15px_rgba(255,122,0,0.25)] border border-transparent",
    secondary:
      "bg-sao-elevated text-sao-text border border-white/10 hover:border-sao-sinon/40 hover:text-sao-sinon active:bg-white/5",
    danger:
      "bg-[rgba(255,42,77,0.12)] text-sao-slash-red border border-sao-slash-red/50 hover:bg-[rgba(255,42,77,0.20)] active:bg-[rgba(255,42,77,0.28)] shadow-[0_0_15px_rgba(255,42,77,0.2)]",
    ghost:
      "bg-transparent text-sao-muted hover:text-sao-text hover:bg-white/5 border border-transparent",
  }[variant];

  return (
    <button
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : null}
      {children}
    </button>
  );
}
