import type { BatchProgress } from '../../types/processing';
import { Card, Icons } from '../ui';

interface ProcessingProgressProps {
  progress: BatchProgress;
}

/** Live batch progress dashboard (PRD §18). */
export function ProcessingProgress({ progress }: ProcessingProgressProps) {
  const percent =
    progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <Card className="anim-pop">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Icons.refresh className="h-4 w-4 animate-spin text-indigo-600" />
          Memproses foto…
        </p>
        <p className="text-sm tabular-nums text-slate-600">
          <span className="font-semibold text-slate-900">{progress.processed}</span> /{' '}
          {progress.total}
        </p>
      </div>

      <div
        className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="shimmer h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="mt-3 text-sm font-semibold tabular-nums text-indigo-600">{percent}%</p>
      {progress.current && (
        <p className="mt-1 animate-pulse truncate text-xs text-slate-400">{progress.current}</p>
      )}
      <p className="mt-2 text-xs text-slate-400">Foto tanpa pasangan jam tetap disalin apa adanya ke subfolder “Tanpa jam”.</p>
    </Card>
  );
}
