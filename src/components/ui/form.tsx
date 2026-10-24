import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Switch as RSwitch } from "radix-ui";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export function Field({ label, hint, error, children, htmlFor, className, aside }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; className?: string; aside?: ReactNode }) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-xs font-medium text-muted">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-down">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

const inputBase =
  "h-9 w-full min-w-0 rounded-lg border bg-elevated px-3 text-[13px] text-fg placeholder:text-subtle outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  invalid?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, prefix, suffix, className, ...rest }, ref) {
  if (!prefix && !suffix) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={cn(inputBase, invalid ? "border-down" : "border-line", className)} {...rest} />;
  }
  return (
    <div className={cn("relative flex items-center", className)}>
      {prefix && <span className="pointer-events-none absolute left-3 text-[13px] text-subtle">{prefix}</span>}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(inputBase, invalid ? "border-down" : "border-line", prefix ? "pl-7" : "", suffix ? "pr-14" : "")}
        {...rest}
      />
      {suffix && <span className="absolute right-3 text-xs font-medium text-muted">{suffix}</span>}
    </div>
  );
});

/** Decimal text input: keeps the raw string, restricts typing to numeric characters. */
export const DecimalInput = forwardRef<HTMLInputElement, Omit<InputProps, "onChange" | "value"> & { value: string; onValueChange: (v: string) => void; allowNegative?: boolean }>(
  function DecimalInput({ value, onValueChange, allowNegative, ...rest }, ref) {
    return (
      <Input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.,-]/g, "");
          const cleaned = allowNegative ? v : v.replace(/-/g, "");
          onValueChange(cleaned);
        }}
        className={cn("num", rest.className)}
        {...rest}
      />
    );
  },
);

export function Select({ className, children, invalid, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className={cn("relative", className)}>
      <select
        className={cn(inputBase, "appearance-none pr-8", invalid ? "border-down" : "border-line")}
        aria-invalid={invalid || undefined}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputBase, "h-auto min-h-[72px] resize-y border-line py-2", className)} {...rest} />;
}

export function Checkbox({ label, checked, onChange, description, id }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; description?: ReactNode; id?: string }) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <label htmlFor={cid} className="flex cursor-pointer items-start gap-2.5">
      <input id={cid} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-[var(--accent)]" />
      <span className="min-w-0">
        <span className="block text-[13px] text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function Switch({ checked, onCheckedChange, label, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <RSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      disabled={disabled}
      className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-line bg-raised transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:opacity-40"
    >
      <RSwitch.Thumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-fg shadow transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-accent-fg" />
    </RSwitch.Root>
  );
}

export function SettingRow({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-fg">{title}</p>
        {description && <p className="mt-0.5 max-w-xl text-xs text-muted">{description}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
