import type { BatchProgress } from '../../types/processing';
import { Icons } from '../ui';

interface ProcessingProgressProps {
  progress: BatchProgress;
}

/** Live batch progress dashboard (PRD §18). */
export function ProcessingProgress({ progress }: ProcessingProgressProps) {
  const percent =
    progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Icons.refresh className="h-4 w-4 animate-spin text-indigo-600" />
          Processing photos
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
          className="h-full rounded-full bg-indigo-600 transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="mt-3 truncate text-xs text-slate-500">
        {percent}%{progress.current ? ` — ${progress.current}` : ''}
      </p>
    </div>
  );
}
