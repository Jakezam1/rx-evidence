"use client";

import { ReactNode } from "react";

type Props = {
  label: string;
  children: ReactNode;
};

export default function SectionCard({ label, children }: Props) {
  return (
    <section className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </div>
      <div className="text-sm leading-relaxed text-ink">{children}</div>
    </section>
  );
}

export function NotReported() {
  return (
    <span className="italic text-ink-subtle">Not reported</span>
  );
}

export function BulletList({ items }: { items: string[] }) {
  if (!items.length) return <NotReported />;
  return (
    <ul className="space-y-1.5">
      {items.map((item, idx) => (
        <li key={`${idx}-${item.slice(0, 20)}`} className="flex gap-2 text-ink">
          <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ink-subtle" aria-hidden="true" />
          <span className="leading-relaxed text-ink-muted">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function EmptyTab({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <p className="text-sm font-medium text-ink-muted">{title}</p>
      <p className="mt-1 text-xs text-ink-subtle">{hint}</p>
    </div>
  );
}
