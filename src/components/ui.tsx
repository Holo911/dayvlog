"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cx("safe-top safe-bottom mx-auto flex w-full max-w-md flex-1 flex-col px-4", className)}>
      {children}
    </main>
  );
}

export function TopBar({ title, back, right }: { title?: ReactNode; back?: string; right?: ReactNode }) {
  return (
    <header className="flex h-12 items-center gap-2">
      {back ? (
        <Link href={back} aria-label="Back" className="-ml-2 grid size-10 place-items-center rounded-full text-ink">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
      ) : null}
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
      {right}
    </header>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; busy?: boolean };

const variants = {
  primary: "bg-accent text-accent-ink font-semibold active:brightness-90",
  secondary: "bg-raised text-ink border border-line active:bg-surface",
  ghost: "text-ink active:bg-raised",
  danger: "bg-raised text-accent border border-line active:bg-surface",
};

export function Button({ variant = "primary", busy, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={cx(
        "flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-base transition disabled:opacity-50",
        variants[variant],
        className,
      )}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = "primary", className, children }: { href: string; variant?: keyof typeof variants; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cx("flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-base transition", variants[variant], className)}
    >
      {children}
    </Link>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-muted">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

const control = "h-12 w-full rounded-xl border border-line bg-surface px-3 text-ink outline-none focus:border-accent";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(control, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(control, "appearance-none", props.className)} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-3xl border border-line bg-surface p-4", className)}>{children}</section>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-accent/10 px-3 py-2 text-sm text-accent">
      {children}
    </p>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}

export function Loading() {
  return (
    <div className="grid flex-1 place-items-center py-24 text-muted">
      <Spinner />
    </div>
  );
}

export function Logo({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <circle cx="256" cy="256" r="96" fill="var(--color-accent)" />
      <circle
        cx="256"
        cy="256"
        r="168"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="26"
        strokeLinecap="round"
        strokeDasharray="880 1056"
        transform="rotate(-90 256 256)"
      />
    </svg>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx("relative h-8 w-13 shrink-0 rounded-full transition disabled:opacity-50", checked ? "bg-ok" : "bg-line")}
    >
      <span className={cx("absolute top-1 size-6 rounded-full bg-white transition-all", checked ? "left-6" : "left-1")} />
    </button>
  );
}

export { cx };
