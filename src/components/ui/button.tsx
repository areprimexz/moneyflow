import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "buy" | "sell";
type Size = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-strong font-medium",
  secondary: "bg-elevated text-fg hover:bg-raised border border-line",
  ghost: "text-muted hover:text-fg hover:bg-hover",
  outline: "border border-line text-fg hover:bg-hover hover:border-line-strong",
  danger: "bg-down text-white hover:brightness-110 font-medium",
  buy: "bg-up text-[#03140d] hover:brightness-110 font-semibold",
  sell: "bg-down text-white hover:brightness-110 font-semibold",
};
const sizes: Record<Size, string> = {
  xs: "h-7 px-2 text-xs gap-1 rounded-md",
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-[13px] gap-2 rounded-lg",
  lg: "h-11 px-4 text-sm gap-2 rounded-lg",
  icon: "h-9 w-9 rounded-lg justify-center",
  "icon-sm": "h-8 w-8 rounded-md justify-center",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", loading, className, children, disabled, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap transition-[background-color,border-color,color,filter] duration-150 disabled:opacity-45 disabled:hover:brightness-100",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
