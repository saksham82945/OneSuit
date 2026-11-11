import React, { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Download, FileUp, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  catalogService,
  describeActionError,
  handleUpgradeError,
  readImportResult,
  formatPrice,
  availabilityLabel,
  CSV_COLUMNS,
  CSV_TEMPLATE,
  type ActionErrorInfo,
  type ProductImportResult,
} from './catalogApi';
import { ActionErrorBox } from './CatalogNotices';

export interface ImportProductsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogId: string;
  /** Called after a real import (not a preview). */
  onImported: (result: ProductImportResult) => void;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'catalogue-products-template.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const actionStyle: Record<string, string> = {
  create: 'bg-emerald-500/15 text-emerald-400 light:bg-emerald-100 light:text-emerald-700',
  update: 'bg-sky-500/15 text-sky-400 light:bg-sky-100 light:text-sky-700',
  skip: 'bg-red-500/15 text-red-400 light:bg-red-100 light:text-red-700',
};

const ImportBody: React.FC<Omit<ImportProductsDialogProps, 'open'>> = ({ onOpenChange, catalogId, onImported }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ProductImportResult | null>(null);
  const [done, setDone] = useState<ProductImportResult | null>(null);
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null);
  const [error, setError] = useState<ActionErrorInfo | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError({ message: 'That file is larger than 2 MB. Split it into smaller files.' });
      return;
    }
    setFileName(file.name);
    setCsv(await file.text());
    setPreview(null);
    setError(null);
  };

  const run = async (dryRun: boolean) => {
    if (!csv.trim()) {
      setError({ message: 'Choose a CSV file or paste rows first.' });
      return;
    }
    setBusy(dryRun ? 'preview' : 'import');
    setError(null);
    try {
      const result = readImportResult(await catalogService.importProducts(catalogId, csv, dryRun));
      if (dryRun) setPreview(result);
      else {
        setDone(result);
        onImported(result);
      }
    } catch (err) {
      if (handleUpgradeError(err)) setError({ message: 'Upgrade your plan to import products.' });
      else setError(describeActionError(err, 'Import failed'));
    } finally {
      setBusy(null);
    }
  };

  const shown = done ?? preview;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Import products from CSV</DialogTitle>
        <DialogDescription>
          Rows are matched by SKU: new SKUs are added, existing ones updated. Prices are in normal units (499.00). Check
          the preview, then import — each product is also sent to Meta.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4 max-h-[66vh] overflow-y-auto pr-1 -mr-1">
        {done ? (
          <div className="flex gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.08] p-3 light:border-emerald-200 light:bg-emerald-50">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400 light:text-emerald-600" />
            <div className="text-xs text-emerald-200 light:text-emerald-800">
              <p className="font-semibold">
                {done.created ?? 0} added · {done.updated ?? 0} updated · {done.invalid} skipped
              </p>
              {(done.sync_failed ?? 0) > 0 && (
                <p className="mt-0.5 text-amber-300 light:text-amber-700">
                  {done.sync_failed} saved here but rejected by Meta — they’re marked “Not in Meta” in the list with
                  Meta’s reason.
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
              <Button type="button" size="sm" variant="outline" className="border-white/10 light:border-gray-200" onClick={() => fileRef.current?.click()}>
                <FileUp className="h-4 w-4 mr-2" /> {fileName ? 'Choose another file' : 'Choose CSV file'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" /> Template
              </Button>
              {fileName && <span className="text-xs text-white/50 light:text-gray-500 truncate max-w-full">{fileName}</span>}
            </div>
            <div className="grid gap-1.5">
              <Textarea
                value={csv}
                onChange={(e) => {
                  setCsv(e.target.value);
                  setPreview(null);
                }}
                rows={5}
                spellCheck={false}
                placeholder={`…or paste rows here, starting with the header:\n${CSV_COLUMNS.join(',')}`}
                className="font-mono text-[11px] bg-white/[0.04] border-white/[0.08] text-white light:bg-white light:border-gray-200 light:text-gray-900"
              />
              <p className="text-[11px] text-white/40 light:text-gray-500">
                Columns: <code className="font-mono">{CSV_COLUMNS.join(', ')}</code>. Required: sku, name, price.
                Currency defaults to INR. Optional extras: sale_price, brand, category, condition. Up to 500 rows.
              </p>
            </div>
          </>
        )}

        {shown && (
          <div className="rounded-lg border border-white/[0.08] light:border-gray-200 overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs bg-white/[0.03] light:bg-gray-50 border-b border-white/[0.08] light:border-gray-200">
              <span className="font-medium text-white light:text-gray-900">{shown.total} rows</span>
              <span className="text-emerald-400 light:text-emerald-700">{shown.valid} ready</span>
              {shown.invalid > 0 && (
                <span className="inline-flex items-center gap-1 text-red-400 light:text-red-600">
                  <AlertTriangle className="h-3 w-3" /> {shown.invalid} with problems (skipped)
                </span>
              )}
            </div>
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#141415] light:bg-white text-white/50 light:text-gray-500">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">Line</th>
                    <th className="px-3 py-1.5 text-left font-medium">Product</th>
                    <th className="px-3 py-1.5 text-left font-medium">Price</th>
                    <th className="px-3 py-1.5 text-left font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.rows.map((row) => (
                    <tr key={row.line} className="border-t border-white/[0.06] light:border-gray-100 align-top">
                      <td className="px-3 py-1.5 tabular-nums text-white/40 light:text-gray-400">{row.line}</td>
                      <td className="px-3 py-1.5 min-w-[140px]">
                        <p className="text-white light:text-gray-900 break-words">{row.name || '—'}</p>
                        <p className="font-mono text-[10px] text-white/40 light:text-gray-500">{row.retailer_id || 'no SKU'}</p>
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-white/70 light:text-gray-700">
                        {row.price > 0 ? formatPrice(row.price, row.currency) : '—'}
                        {row.availability && row.action !== 'skip' && (
                          <p className="text-[10px] text-white/40 light:text-gray-500">{availabilityLabel(row.availability)}</p>
                        )}
                      </td>
                      <td className="px-3 py-1.5 min-w-[140px]">
                        <span className={cn('inline-block rounded px-1.5 py-0.5 text-[10px] font-medium capitalize', actionStyle[row.action])}>
                          {row.action === 'skip' ? 'Skipped' : row.action === 'create' ? 'Add' : 'Update'}
                        </span>
                        {row.error && <p className="mt-0.5 text-[11px] text-red-400 light:text-red-600 break-words">{row.error}</p>}
                        {row.sync_status === 'error' && (
                          <p className="mt-0.5 text-[11px] text-amber-400 light:text-amber-700 break-words">Meta: {row.sync_error}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <ActionErrorBox error={error} />
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        {done ? (
          <Button type="button" onClick={() => onOpenChange(false)} className="bg-emerald-600 hover:bg-emerald-500 text-white">
            Done
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" disabled={!!busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {preview && preview.valid > 0 ? (
              <Button type="button" disabled={!!busy} onClick={() => run(false)} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                {busy === 'import' ? 'Importing…' : `Import ${preview.valid} product${preview.valid === 1 ? '' : 's'}`}
              </Button>
            ) : (
              <Button type="button" disabled={!!busy || !csv.trim()} onClick={() => run(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                {busy === 'preview' ? 'Checking…' : 'Preview'}
              </Button>
            )}
          </>
        )}
      </DialogFooter>
    </>
  );
};

/** Bulk CSV import with a server-side preview (dry run) before anything is saved. */
export const ImportProductsDialog: React.FC<ImportProductsDialogProps> = ({ open, onOpenChange, ...rest }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[680px]">{open && <ImportBody onOpenChange={onOpenChange} {...rest} />}</DialogContent>
  </Dialog>
);
