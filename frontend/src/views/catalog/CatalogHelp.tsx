import React, { useState } from 'react';
import { ChevronDown, ExternalLink, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COMMERCE_LINKS } from './catalogApi';

const ExtLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1 font-medium text-emerald-400 hover:text-emerald-300 light:text-emerald-700 light:hover:text-emerald-800"
  >
    {children}
    <ExternalLink className="h-3 w-3" />
  </a>
);

/** "How to get your catalogue ID / create one in Commerce Manager". */
export const CatalogHelpPanel: React.FC<{ defaultOpen?: boolean; className?: string }> = ({ defaultOpen = false, className }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      className={cn(
        'rounded-xl border border-teal-500/20 bg-teal-500/[0.05] light:border-teal-200 light:bg-teal-50/60',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <HelpCircle className="h-4 w-4 shrink-0 text-teal-400 light:text-teal-600" />
        <span className="flex-1 text-sm font-semibold text-white light:text-gray-900">
          No catalogue yet? How to create one and find its ID
        </span>
        <ChevronDown className={cn('h-4 w-4 text-white/50 light:text-gray-500 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid gap-4 px-4 pb-4 text-xs leading-relaxed text-white/70 light:text-gray-700 md:grid-cols-2">
          <div>
            <p className="mb-1.5 font-semibold text-white light:text-gray-900">Create a catalogue</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                Open <ExtLink href={COMMERCE_LINKS.commerceManager}>Commerce Manager</ExtLink> with the Facebook account that
                manages your business.
              </li>
              <li>
                Choose <b>Add catalogue</b> → <b>E-commerce</b> → <b>Upload product info</b>, and pick the same business
                that owns your WhatsApp number.
              </li>
              <li>Add a few products there — or create an empty one and add products from this page.</li>
            </ol>
            <p className="mt-2">
              Or skip Commerce Manager: <b>Create catalogue</b> on this page makes one in the business that owns your
              WhatsApp number (the access token needs the <code className="font-mono">catalog_management</code> permission).
            </p>
          </div>
          <div>
            <p className="mb-1.5 font-semibold text-white light:text-gray-900">Find the catalogue ID</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>In Commerce Manager, open the catalogue and go to <b>Settings</b> (or look at the page address).</li>
              <li>
                Copy the long number shown as <b>Catalogue ID</b> (e.g. <code className="font-mono">1234567890123456</code>).
              </li>
              <li>
                Here, choose <b>Link catalogue</b> → <b>Enter catalogue ID</b>. It’s connected to the WhatsApp number so it
                shows on your WhatsApp profile.
              </li>
            </ol>
            <p className="mt-2">
              You can also connect it in{' '}
              <ExtLink href={COMMERCE_LINKS.businessSettings}>Business settings → WhatsApp accounts → Catalogue</ExtLink>, then
              press <b>Sync from Meta</b>. More: <ExtLink href={COMMERCE_LINKS.guide}>Selling on WhatsApp</ExtLink>.
            </p>
          </div>
        </div>
      )}
    </section>
  );
};
