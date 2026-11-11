import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Check, Copy, Download, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { AI_PROMPT_TEMPLATE, SAMPLE_BOT_FILE, downloadJson } from './botFile';

interface AiBotHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportClick: () => void;
}

/** Explains the bot file and gives a prompt that makes any AI tool write one. */
export const AiBotHelpDialog: React.FC<AiBotHelpDialogProps> = ({ open, onOpenChange, onImportClick }) => {
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT_TEMPLATE);
      setCopied(true);
      toast.success('Prompt copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy; select the text and copy it instead');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto bg-[#141415] border-white/10 text-white light:bg-white light:text-gray-900 light:border-gray-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-teal-400 light:text-teal-600" />
            Create a bot with AI
          </DialogTitle>
          <DialogDescription className="text-xs text-white/50 light:text-gray-500">
            Any AI chat tool can write a OneSuit bot file for you.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-1.5 text-xs text-white/80 light:text-gray-700 list-decimal pl-4">
          <li>Copy the prompt below and paste it into your AI tool.</li>
          <li>Replace the <span className="font-semibold">MY BOT</span> line with what your bot should do.</li>
          <li>Save the AI's answer as a <span className="font-mono">.json</span> file, or copy it.</li>
          <li>Click <span className="font-semibold">Import</span>, choose the file or paste the JSON, check the preview and import.</li>
        </ol>

        <div className="relative">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/40 p-3 pr-12 font-mono text-[10.5px] leading-relaxed text-white/80 light:border-gray-200 light:bg-gray-50 light:text-gray-800">
            {AI_PROMPT_TEMPLATE}
          </pre>
          <Button
            size="sm"
            variant="outline"
            onClick={copyPrompt}
            className="absolute right-2 top-2 h-7 border-white/10 bg-[#141415] px-2 text-[11px] light:bg-white light:border-gray-200"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="ml-1">{copied ? 'Copied' : 'Copy'}</span>
          </Button>
        </div>

        <p className="text-[11px] text-white/50 light:text-gray-500">
          The sample file has one bot of every type: a simple bot, a media bot, an advanced bot and three keyword bots
          (text reply, start a flow, hand over to an agent). Media files aren't inside a bot file; re-upload them after
          importing.
        </p>

        <DialogFooter className="gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadJson(SAMPLE_BOT_FILE, 'onesuit-bots-sample.json')}
            className="border-white/10 text-xs light:border-gray-200"
          >
            <Download className="mr-1.5 h-4 w-4 text-emerald-400 light:text-emerald-600" />
            Download sample file
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onImportClick();
            }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
          >
            Import a bot file
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AiBotHelpDialog;
