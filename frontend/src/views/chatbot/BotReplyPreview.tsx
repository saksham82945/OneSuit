import React from 'react';
import { ExternalLink, FileText, List, Mic, Play, Reply } from 'lucide-react';
import { cn } from '@/lib/utils';
import { previewText } from './botReplyMedia';
import { isMediaHeader, type BotReply } from './chatbotFlowTypes';

/** WhatsApp-style *bold*, _italic_ and ~strike~ for the preview. */
function formatWhatsApp(text: string): React.ReactNode[] {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g);
  return parts.map((p, i) => {
    if (/^\*[^*]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>;
    if (/^_[^_]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    if (/^~[^~]+~$/.test(p)) return <s key={i}>{p.slice(1, -1)}</s>;
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

export const BotReplyPreview: React.FC<{ reply: BotReply; mediaUrl?: string; className?: string }> = ({
  reply,
  mediaUrl,
  className,
}) => {
  const h = reply.header;
  const media = isMediaHeader(h.type);
  const body = previewText(reply.body);
  const interactive = reply.interactive;
  const time = '10:24';

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden border border-white/[0.08] shadow-xl light:border-gray-200',
        className
      )}
    >
      {/* Chat header */}
      <div className="flex items-center gap-2 bg-[#1f2c33] px-3 py-2 light:bg-[#075e54]">
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-[11px] font-bold text-white">
          OS
        </div>
        <div className="leading-tight">
          <div className="text-xs font-semibold text-white">Your Business</div>
          <div className="text-[10px] text-white/60">online</div>
        </div>
      </div>

      {/* Chat body */}
      <div className="min-h-[260px] bg-[#0b141a] p-3 light:bg-[#efeae2]">
        <div className="max-w-[88%] space-y-1">
          <div className="rounded-lg rounded-tl-none bg-[#202c33] p-1 text-[13px] text-[#e9edef] shadow light:bg-white light:text-[#111b21]">
            {h.type === 'text' && h.text && (
              <div className="px-1.5 pt-1 font-semibold">{previewText(h.text)}</div>
            )}
            {media && h.type === 'image' && (
              mediaUrl ? (
                <img src={mediaUrl} alt="" className="w-full max-h-48 object-cover rounded-md" />
              ) : (
                <div className="h-32 rounded-md bg-white/[0.06] flex items-center justify-center text-[11px] text-white/40 light:bg-gray-100 light:text-gray-400">
                  Image
                </div>
              )
            )}
            {media && h.type === 'video' && (
              <div className="relative h-32 rounded-md bg-black/60 flex items-center justify-center overflow-hidden">
                {mediaUrl && <video src={mediaUrl} className="absolute inset-0 h-full w-full object-cover opacity-70" muted />}
                <div className="relative h-10 w-10 rounded-full bg-black/50 flex items-center justify-center">
                  <Play className="h-5 w-5 text-white fill-white" />
                </div>
              </div>
            )}
            {media && h.type === 'audio' && (
              <div className="flex items-center gap-2 px-2 py-2">
                <div className="h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Mic className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1 h-1 rounded bg-white/20 light:bg-gray-300" />
                <span className="text-[10px] opacity-60">0:12</span>
              </div>
            )}
            {media && h.type === 'document' && (
              <div className="flex items-center gap-2 rounded-md bg-black/20 px-2 py-2 light:bg-gray-100">
                <FileText className="h-6 w-6 text-rose-400 shrink-0" />
                <span className="truncate text-xs">{h.filename || 'Document'}</span>
              </div>
            )}
            {body && (
              <div className="whitespace-pre-wrap break-words px-1.5 pt-1">{formatWhatsApp(body)}</div>
            )}
            {reply.footer && interactive !== 'none' && (
              <div className="px-1.5 pt-0.5 text-[11px] opacity-50">{previewText(reply.footer)}</div>
            )}
            <div className="px-1.5 text-right text-[10px] opacity-50">{time}</div>
            {interactive === 'cta_url' && (
              <div className="mt-1 border-t border-white/10 py-1.5 text-center text-[13px] text-[#53bdeb] flex items-center justify-center gap-1.5 light:border-gray-200 light:text-[#027eb5]">
                <ExternalLink className="h-3.5 w-3.5" />
                {reply.cta.display_text || 'Visit website'}
              </div>
            )}
            {interactive === 'cta_url' && reply.cta2?.display_text?.trim() && (
              <div className="mt-1 border-t border-white/10 py-1.5 text-center text-[13px] text-[#53bdeb] flex items-center justify-center gap-1.5 light:border-gray-200 light:text-[#027eb5]">
                <ExternalLink className="h-3.5 w-3.5" />
                {reply.cta2.display_text}
                <span className="text-[10px] opacity-60">(2nd message)</span>
              </div>
            )}
            {interactive === 'list' && (
              <div className="mt-1 border-t border-white/10 py-1.5 text-center text-[13px] text-[#53bdeb] flex items-center justify-center gap-1.5 light:border-gray-200 light:text-[#027eb5]">
                <List className="h-3.5 w-3.5" />
                {reply.list.button_text || 'Menu'}
              </div>
            )}
          </div>
          {interactive === 'buttons' &&
            reply.buttons.map((b) => (
              <div
                key={b.id}
                className="rounded-lg bg-[#202c33] py-1.5 text-center text-[13px] text-[#53bdeb] flex items-center justify-center gap-1.5 shadow light:bg-white light:text-[#027eb5]"
              >
                <Reply className="h-3.5 w-3.5" />
                {previewText(b.title) || 'Button'}
              </div>
            ))}
        </div>

        {interactive === 'list' && reply.list.sections.some((s) => s.rows.length) && (
          <div className="mt-3 rounded-lg bg-[#202c33] p-2 text-[12px] text-[#e9edef] light:bg-white light:text-[#111b21]">
            <div className="text-[10px] uppercase tracking-wide opacity-50 pb-1">List opens as</div>
            {reply.list.sections.map((s, si) => (
              <div key={si} className="pb-1">
                {s.title && <div className="text-[11px] font-semibold text-emerald-400 py-0.5">{s.title}</div>}
                {s.rows.map((r) => (
                  <div key={r.id} className="flex items-start gap-2 py-1 border-b border-white/[0.06] last:border-0 light:border-gray-100">
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{previewText(r.title) || 'Row'}</div>
                      {r.description && <div className="text-[11px] opacity-60 truncate">{previewText(r.description)}</div>}
                    </div>
                    <span className="mt-1 h-3 w-3 rounded-full border border-white/30 shrink-0 light:border-gray-400" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
