import type { BatchOutput } from '../../types/processing';
import { Badge, Card, Icons, StatCard, TableShell } from '../ui';

interface ResultPanelProps {
  output: BatchOutput;
}

/**
 * Step 6 (PRDv2 §33, §34): processing summary — total, successful, failed,
 * the output folder, and the reason every failed photo failed.
 */
export function ResultPanel({ output }: ResultPanelProps) {
  const { summary, results, outputFolderName } = output;
  const failures = results.filter((result) => result.status === 'failed');
  const successes = results.filter((result) => result.status === 'success');

  return (
    <Card
      title="Batch Processing Complete"
      subtitle="Original photos were left untouched; processed copies were saved to the output folder"
      actions={
        summary.failed === 0 ? (
          <Badge tone="emerald">
            <Icons.check className="h-3.5 w-3.5" />
            All successful
          </Badge>
        ) : (
          <Badge tone="red">
            <Icons.alert className="h-3.5 w-3.5" />
            {summary.failed} failed
          </Badge>
        )
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total" value={summary.total} tone="slate" hint="photos processed" />
        <StatCard
          label="Successful"
          value={summary.successful}
          tone={summary.successful > 0 ? 'emerald' : 'slate'}
          hint="saved with timestamp"
        />
        <StatCard
          label="Failed"
          value={summary.failed}
          tone={summary.failed > 0 ? 'red' : 'slate'}
          hint="see reasons below"
        />
        <StatCard label="Output folder" value={outputFolderName} tone="indigo" hint="processed copies" />
      </div>

      {failures.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
            Failed photos ({failures.length})
          </p>
          <TableShell headers={['Photo', 'Reason']} maxHeight="max-h-64">
            {failures.map((result, index) => (
              <tr key={`${result.filename}-${index}`} className="bg-white hover:bg-red-50/40">
                <td className="px-4 py-2 font-medium text-slate-800">
                  <span className="block max-w-[280px] truncate">{result.filename}</span>
                </td>
                <td className="px-4 py-2 text-xs text-red-700">{result.error}</td>
              </tr>
            ))}
          </TableShell>
        </div>
      )}

      {successes.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Saved files ({successes.length})
          </p>
          <TableShell headers={['Original', 'Saved as']} maxHeight="max-h-64">
            {successes.map((result, index) => (
              <tr key={`${result.filename}-${index}`} className="bg-white hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-700">
                  <span className="block max-w-[280px] truncate">{result.filename}</span>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-emerald-700">
                  {result.outputFilename}
                </td>
              </tr>
            ))}
          </TableShell>
        </div>
      )}

      <p className="mt-5 flex items-start gap-2 text-xs text-slate-500">
        <Icons.info className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
        The processed photos are saved in the “{outputFolderName}” folder you selected. Open it in
        your file manager to review the results.
      </p>
    </Card>
  );
}
