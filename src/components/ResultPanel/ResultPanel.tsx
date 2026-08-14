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
  const copied = results.filter((result) => result.status === 'copied');

  return (
    <Card
      className="anim-pop"
      title="Batch selesai diproses"
      subtitle="Foto asli tidak diubah; salinan hasil disimpan ke folder output"
      actions={
        summary.failed === 0 ? (
          <Badge tone="emerald">
            <Icons.check className="h-3.5 w-3.5" />
            Semua berhasil
          </Badge>
        ) : (
          <Badge tone="red">
            <Icons.alert className="h-3.5 w-3.5" />
            {summary.failed} gagal
          </Badge>
        )
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total" value={summary.total} tone="slate" hint="semua foto" />
        <StatCard
          label="Berhasil"
          value={summary.successful}
          tone={summary.successful > 0 ? 'emerald' : 'slate'}
          hint="tersimpan dengan timestamp"
        />
        <StatCard
          label="Disalin apa adanya"
          value={summary.copied}
          tone={summary.copied > 0 ? 'amber' : 'slate'}
          hint="tanpa jam — di subfolder “Tanpa jam”"
        />
        <StatCard
          label="Gagal"
          value={summary.failed}
          tone={summary.failed > 0 ? 'red' : 'slate'}
          hint="lihat alasan di bawah"
        />
        <StatCard label="Folder output" value={outputFolderName} tone="indigo" hint="salinan hasil proses" />
      </div>

      {failures.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
            Foto gagal ({failures.length})
          </p>
          <TableShell headers={['Foto', 'Alasan']} maxHeight="max-h-64">
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
            File tersimpan ({successes.length})
          </p>
          <TableShell headers={['Asli', 'Tersimpan sebagai']} maxHeight="max-h-64">
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

      {copied.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
            Disalin apa adanya tanpa timestamp ({copied.length})
          </p>
          <TableShell headers={['Foto', 'Tersimpan sebagai']} maxHeight="max-h-64">
            {copied.map((result, index) => (
              <tr key={`${result.filename}-${index}`} className="bg-white hover:bg-amber-50/40">
                <td className="px-4 py-2 text-slate-700">
                  <span className="block max-w-[280px] truncate">{result.filename}</span>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-amber-700">
                  {result.outputFilename}
                </td>
              </tr>
            ))}
          </TableShell>
        </div>
      )}

      <p className="mt-5 flex items-start gap-2 text-xs text-slate-500">
        <Icons.info className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
        Hasil disimpan di folder “{outputFolderName}” yang Anda pilih. Foto yang tidak punya
        pasangan jam ada di subfolder “Tanpa jam” di dalamnya, disalin apa adanya.
      </p>
    </Card>
  );
}
