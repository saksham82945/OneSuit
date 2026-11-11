import React, { useRef, useState } from 'react';
import { chatbotService } from '@/services/api';
import { readData } from '@/services/response';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, CheckCircle2, FileCode, Key, Loader2, Upload, Workflow, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { parseBotFileText, reportProblemCount, type BotImportItem, type BotImportReport } from './botFile';

interface ImportBotsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

type ApiError = { response?: { data?: { message?: string; data?: unknown } } };

const isReport = (v: unknown): v is BotImportReport =>
  !!v && typeof v === 'object' && Array.isArray((v as BotImportReport).flows);

const KIND_LABEL: Record<string, string> = {
  simple: 'Simple bot',
  media: 'Media bot',
  advanced: 'Advanced bot',
  text: 'Text reply',
  transfer: 'Agent transfer',
  flow: 'Starts a flow',
};

const ItemRow: React.FC<{ item: BotImportItem; keyword?: boolean }> = ({ item, keyword }) => {
  const bad = item.errors.length > 0;
  const Icon = keyword ? Key : Workflow;
  return (
    <li
      className={`rounded-lg border p-2.5 text-xs ${
        bad
          ? 'border-red-500/30 bg-red-500/[0.06] light:bg-red-50 light:border-red-200'
          : 'border-white/[0.08] bg-white/[0.02] light:border-gray-200 light:bg-gray-50'
      }`}
    >
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${bad ? 'text-red-400 light:text-red-600' : 'text-emerald-400 light:text-emerald-600'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold break-all text-white light:text-gray-900">{item.final_name || item.name || `Bot ${item.index + 1}`}</span>
            {item.kind && (
              <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] text-teal-300 light:bg-teal-50 light:text-teal-700">
                {KIND_LABEL[item.kind] || item.kind}
              </span>
            )}
            {item.action === 'rename' && (
              <span className="text-[10px] text-amber-300 light:text-amber-700">renamed from “{item.name}”</span>
            )}
          </div>
          <div className="mt-0.5 text-[11px] text-white/50 light:text-gray-500 break-words">
            {item.steps ? `${item.steps} steps` : null}
            {item.keywords && item.keywords.length > 0 && (
              <>
                {item.steps ? ' · ' : ''}
                {keyword ? 'keywords' : 'starts on'}: {item.keywords.join(', ')}
              </>
            )}
            {item.flow_ref && (
              <>
                {' · '}starts “{item.flow_ref}”
                {item.flow_resolved === 'file' && ' (from this file)'}
                {item.flow_resolved === 'existing' && ' (already in your workspace)'}
              </>
            )}
          </div>
          {item.errors.map((e) => (
            <p key={e} className="mt-1 flex gap-1 text-red-300 light:text-red-700">
              <XCircle className="h-3.5 w-3.5 mt-px shrink-0" /> {e}
            </p>
          ))}
          {item.warnings.map((w) => (
            <p key={w} className="mt-1 flex gap-1 text-amber-300 light:text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" /> {w}
            </p>
          ))}
        </div>
      </div>
    </li>
  );
};

/** Import → choose a file or paste JSON → preview what will be created → import. */
export const ImportBotsDialog: React.FC<ImportBotsDialogProps> = ({ open, onOpenChange, onImported }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'file' | 'paste'>('file');
  const [pasted, setPasted] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<BotImportReport | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setPasted('');
    setFileName(null);
    setParsed(null);
    setError(null);
    setReport(null);
    setBusy(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const runPreview = async (text: string, legacyName?: string) => {
    setReport(null);
    const result = parseBotFileText(text);
    if ('error' in result) {
      setParsed(null);
      setError(result.error);
      return;
    }
    let value = result.value as Record<string, unknown>;
    // An old single-flow export without a name: name it after the file, as before.
    if (legacyName && !('onesuit_bot_format' in value) && !('flows' in value) && !('keyword_bots' in value) && !value.name) {
      value = { ...value, name: legacyName };
    }
    setParsed(value);
    setError(null);
    setBusy(true);
    try {
      const res = await chatbotService.importBots(value, true);
      setReport(readData<BotImportReport>(res));
    } catch (err) {
      const data = (err as ApiError)?.response?.data;
      if (isReport(data?.data)) setReport(data.data);
      else setError(data?.message || 'Could not check the file');
    } finally {
      setBusy(false);
    }
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => runPreview(String(e.target?.result ?? ''), file.name.replace(/\.[^/.]+$/, ''));
    reader.onerror = () => setError('Could not read the file');
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!parsed) return;
    setBusy(true);
    try {
      const res = await chatbotService.importBots(parsed, false);
      const done = readData<BotImportReport>(res);
      const parts = [];
      if (done.created.flows) parts.push(`${done.created.flows} flow bot${done.created.flows === 1 ? '' : 's'}`);
      if (done.created.keyword_bots) parts.push(`${done.created.keyword_bots} keyword bot${done.created.keyword_bots === 1 ? '' : 's'}`);
      toast.success(`Imported ${parts.join(' and ') || 'nothing'}`);
      onImported();
      handleOpenChange(false);
    } catch (err) {
      const data = (err as ApiError)?.response?.data;
      if (isReport(data?.data)) setReport(data.data);
      toast.error(data?.message || 'Import failed');
      setBusy(false);
    }
  };

  const problems = report ? reportProblemCount(report) : 0;
  const total = report ? report.flows.length + report.keyword_bots.length : 0;
  const canImport = !!report && report.valid && problems === 0 && total > 0 && !busy;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-xl max-h-[90vh] overflow-y-auto bg-[#141415] border-white/10 text-white light:bg-white light:text-gray-900 light:border-gray-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5 text-emerald-400 light:text-emerald-600" />
            Import bots
          </DialogTitle>
          <DialogDescription className="text-xs text-white/50 light:text-gray-500">
            A OneSuit bot file can hold flow bots and keyword bots. You'll see what will be created before anything is saved;
            existing bots are never changed.
          </DialogDescription>
        </DialogHeader>

        <input
          type="file"
          ref={fileInputRef}
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'file' | 'paste')}>
          <TabsList>
            <TabsTrigger value="file">Choose file</TabsTrigger>
            <TabsTrigger value="paste">Paste JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="file">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-white/15 p-5 text-center transition-all hover:border-emerald-500/50 hover:bg-white/[0.02] light:border-gray-300 light:hover:border-emerald-500 light:hover:bg-emerald-50/40"
            >
              <Upload className="mx-auto mb-2 h-7 w-7 text-emerald-400 light:text-emerald-600" />
              <p className="text-xs font-semibold text-white light:text-gray-800 break-all">
                {fileName || 'Click to choose a .json bot file'}
              </p>
              <p className="mt-1 text-[11px] text-white/40 light:text-gray-500">
                OneSuit bot files and older single-flow exports both work
              </p>
            </button>
          </TabsContent>
          <TabsContent value="paste" className="space-y-2">
            <Textarea
              rows={8}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder='{"onesuit_bot_format": 1, "flows": [...], "keyword_bots": [...]}'
              className="font-mono text-[11px] bg-white/[0.03] border-white/10 light:bg-white light:border-gray-200"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!pasted.trim() || busy}
              onClick={() => runPreview(pasted)}
              className="border-white/10 text-xs light:border-gray-200"
            >
              Check JSON
            </Button>
          </TabsContent>
        </Tabs>

        {busy && !report && (
          <div className="flex items-center gap-2 text-xs text-white/60 light:text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking the file…
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 light:bg-red-50 light:text-red-700 light:border-red-200">
            {error}
          </div>
        )}

        {report && (
          <div className="space-y-3">
            {problems === 0 && total > 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3 text-xs font-semibold text-emerald-300 light:bg-emerald-50 light:text-emerald-700 light:border-emerald-200">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Ready to import {report.flows.length} flow bot{report.flows.length === 1 ? '' : 's'} and{' '}
                {report.keyword_bots.length} keyword bot{report.keyword_bots.length === 1 ? '' : 's'}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-semibold text-red-300 light:bg-red-50 light:text-red-700 light:border-red-200">
                <XCircle className="h-4 w-4 shrink-0" />
                {problems} problem{problems === 1 ? '' : 's'} to fix before importing. Nothing has been saved.
              </div>
            )}
            {report.errors.map((e) => (
              <p key={e} className="text-xs text-red-300 light:text-red-700">{e}</p>
            ))}
            {report.warnings.map((w) => (
              <p key={w} className="flex gap-1 text-xs text-amber-300 light:text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" /> {w}
              </p>
            ))}
            {report.flows.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/50 light:text-gray-500">Flow bots</h4>
                <ul className="space-y-1.5">
                  {report.flows.map((f) => <ItemRow key={`f${f.index}`} item={f} />)}
                </ul>
              </div>
            )}
            {report.keyword_bots.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/50 light:text-gray-500">Keyword bots</h4>
                <ul className="space-y-1.5">
                  {report.keyword_bots.map((k) => <ItemRow key={`k${k.index}`} item={k} keyword />)}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)} className="border-white/10 text-xs light:border-gray-200">
            Cancel
          </Button>
          <Button size="sm" disabled={!canImport} onClick={handleImport} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs">
            {busy && report ? 'Importing…' : `Import${total ? ` ${total} bot${total === 1 ? '' : 's'}` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportBotsDialog;
