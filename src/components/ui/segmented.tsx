import { cn } from "@/lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "sm",
  className,
  label,
  stretch,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly SegmentedOption<T>[];
  size?: "xs" | "sm";
  className?: string;
  label: string;
  stretch?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-line bg-elevated p-0.5 scrollbar-none", stretch && "flex w-full", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const idx = options.findIndex((x) => x.value === value);
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const dir = e.key === "ArrowRight" ? 1 : -1;
                for (let i = 1; i <= options.length; i++) {
                  const next = options[(idx + dir * i + options.length) % options.length]!;
                  if (!next.disabled) {
                    onChange(next.value);
                    break;
                  }
                }
              }
            }}
            tabIndex={active ? 0 : -1}
            className={cn(
              "shrink-0 rounded-md font-medium whitespace-nowrap transition-colors",
              size === "xs" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs",
              stretch && "flex-1",
              active ? "bg-card text-fg shadow-sm ring-1 ring-line-strong" : "text-muted hover:text-fg",
              o.disabled && "opacity-40",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
