import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, MouseEvent as ReactMouseEvent, ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/* Icons (inline SVG, stroke style)                                    */
/* ------------------------------------------------------------------ */

interface IconProps {
  className?: string;
}

function stroke(children: ReactNode, { className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const Icons = {
  logo: ({ className = 'h-5 w-5' }: IconProps) =>
    stroke(
      <>
        <path d="M3 8.5 5 4h14l2 4.5" />
        <path d="M3 8.5h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-10Z" />
        <path d="M8 13h8" />
        <path d="M8 16.5h5" />
      </>,
      { className },
    ),
  database: ({ className }: IconProps) =>
    stroke(
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
        <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
      </>,
      { className },
    ),
  image: ({ className }: IconProps) =>
    stroke(
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </>,
      { className },
    ),
  clipboard: ({ className }: IconProps) =>
    stroke(
      <>
        <rect x="8" y="2" width="8" height="4" rx="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <path d="m9 13 2 2 4-4" />
      </>,
      { className },
    ),
  download: ({ className }: IconProps) =>
    stroke(
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="m7 10 5 5 5-5" />
        <path d="M12 15V3" />
      </>,
      { className },
    ),
  upload: ({ className }: IconProps) =>
    stroke(
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="m7 8 5-5 5 5" />
        <path d="M12 3v12" />
      </>,
      { className },
    ),
  link: ({ className }: IconProps) =>
    stroke(
      <>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </>,
      { className },
    ),
  check: ({ className }: IconProps) =>
    stroke(<path d="M20 6 9 17l-5-5" />, { className }),
  x: ({ className }: IconProps) =>
    stroke(
      <>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </>,
      { className },
    ),
  alert: ({ className }: IconProps) =>
    stroke(
      <>
        <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </>,
      { className },
    ),
  info: ({ className }: IconProps) =>
    stroke(
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </>,
      { className },
    ),
  file: ({ className }: IconProps) =>
    stroke(
      <>
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      </>,
      { className },
    ),
  arrowRight: ({ className }: IconProps) =>
    stroke(
      <>
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </>,
      { className },
    ),
  arrowLeft: ({ className }: IconProps) =>
    stroke(
      <>
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </>,
      { className },
    ),
  refresh: ({ className }: IconProps) =>
    stroke(
      <>
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <path d="M3 21v-5h5" />
      </>,
      { className },
    ),
  settings: ({ className }: IconProps) =>
    stroke(
      <>
        <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
        <path d="M1 14h6M9 8h6M17 16h6" />
      </>,
      { className },
    ),
  lock: ({ className }: IconProps) =>
    stroke(
      <>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </>,
      { className },
    ),
  sparkles: ({ className }: IconProps) =>
    stroke(
      <>
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      </>,
      { className },
    ),
  bulb: ({ className }: IconProps) =>
    stroke(
      <>
        <path d="M9 18h6" />
        <path d="M10 22h4" />
        <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2Z" />
      </>,
      { className },
    ),
};

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
export function Card({
  title,
  subtitle,
  actions,
  children,
  padded = true,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`anim-fade-up overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/5 ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            {title && (
              <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900">
                {title}
              </h3>
            )}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={padded ? 'p-6' : ''}>{children}</div>
    </section>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25 hover:from-indigo-500 hover:to-violet-500 focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none',
  secondary:
    'border border-slate-200 bg-white text-slate-700 shadow-sm shadow-slate-900/5 hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-300/50 disabled:opacity-60',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:opacity-60',
  danger:
    'border border-red-200 bg-white text-red-700 shadow-sm shadow-red-900/5 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-300/50 disabled:opacity-60',
};

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    // Interactive feedback: a ripple grows from the exact click point.
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    ripple.style.background =
      variant === 'primary' ? 'rgb(255 255 255 / 0.35)' : 'rgb(99 102 241 / 0.18)';
    el.appendChild(ripple);
    window.setTimeout(() => ripple.remove(), 650);
    onClick?.(event);
  };
  return (
    <button
      type={type}
      onClick={handleClick}
      className={`relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-[0.97] focus-visible:outline-none disabled:cursor-not-allowed ${BUTTON_STYLES[variant]} ${className}`}
      {...rest}
    />
  );
}

/** Animated number — counts up from 0 whenever `value` changes. */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(Math.round(value * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <>{display}</>;
}

type BadgeTone = 'slate' | 'emerald' | 'red' | 'amber' | 'indigo' | 'sky';

const BADGE_TONES: Record<BadgeTone, string> = {
  slate: 'bg-slate-100 text-slate-600 ring-slate-200/60',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60',
  red: 'bg-red-50 text-red-700 ring-red-200/60',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200/60',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200/60',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200/60',
};

export function Badge({
  tone = 'slate',
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`anim-pop inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  tone = 'slate',
  hint,
}: {
  label: string;
  value: number | string;
  tone?: BadgeTone;
  hint?: string;
}) {
  const valueColor: Record<BadgeTone, string> = {
    slate: 'text-slate-900',
    emerald: 'text-emerald-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
    indigo: 'text-indigo-600',
    sky: 'text-sky-600',
  };
  return (
    <Tilt3D maxTilt={6} glare={false} className="rounded-2xl">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className={`mt-1.5 text-2xl font-bold tabular-nums tracking-tight ${valueColor[tone]}`}>
          {typeof value === 'number' ? <CountUp value={value} /> : value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </div>
    </Tilt3D>
  );
}

/** Table wrapper with sticky header — used for every management-style list. */
export function TableShell({
  headers,
  children,
  maxHeight = 'max-h-80',
}: {
  headers: string[];
  children: ReactNode;
  maxHeight?: string;
}) {
  return (
    <div className={`overflow-auto rounded-xl border border-slate-200/80 shadow-sm shadow-slate-900/5 ${maxHeight}`}>
      <table className="w-full min-w-max text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50/95 text-[11px] font-semibold uppercase tracking-wider text-slate-400 backdrop-blur">
          <tr>
            {headers.map((header) => (
              <th key={header} className="border-b border-slate-200/80 px-4 py-2.5">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

/** Form field label wrapper. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-slate-400">{hint}</span>}
    </label>
  );
}

export const inputClasses =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm shadow-slate-900/5 transition focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400';

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <Icons.alert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function InfoBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-sky-200/80 bg-sky-50 px-4 py-3 text-sm text-sky-800">
      <Icons.info className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function WarningBanner({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-xs text-amber-900">
      <p className="flex items-center gap-1.5 font-semibold">
        <Icons.alert className="h-4 w-4" />
        {title}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/** Tutorial/hint panel shown at the top of each step. */
export function Guide({ title = 'Panduan langkah ini', steps }: { title?: string; steps: ReactNode[] }) {
  return (
    <div className="anim-fade-up rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 to-violet-50/40 px-5 py-4">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-indigo-900">
        <Icons.bulb className="h-4 w-4 text-indigo-500" />
        {title}
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-indigo-950/70">
        {steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
            active === tab.id
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tilt3D — perspective card that follows the cursor (subtle 3D)       */
/* ------------------------------------------------------------------ */

export function Tilt3D({
  children,
  className = '',
  maxTilt = 8,
  glare = true,
}: {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
  glare?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-py * maxTilt).toFixed(2)}deg) rotateY(${(px * maxTilt).toFixed(2)}deg) translateZ(8px)`;
    if (glare) {
      el.style.setProperty('--glare-x', `${((px + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty('--glare-y', `${((py + 0.5) * 100).toFixed(1)}%`);
    }
  };

  const handleLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0)';
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={`tilt-card preserve-3d group/tilt relative ${className}`}
    >
      {children}
      {glare && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/tilt:opacity-100"
          style={{
            background:
              'radial-gradient(24rem 16rem at var(--glare-x, 50%) var(--glare-y, 50%), rgb(255 255 255 / 0.22), transparent 70%)',
          }}
        />
      )}
    </div>
  );
}
