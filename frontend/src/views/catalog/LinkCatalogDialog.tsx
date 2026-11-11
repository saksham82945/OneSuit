import React, { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link2, Loader2, RefreshCw, Store } from 'lucide-react';
import {
  catalogService,
  describeActionError,
  handleUpgradeError,
  readAvailable,
  readCatalog,
  type ActionErrorInfo,
  type AvailableCatalog,
  type Catalog,
} from './catalogApi';
import { ActionErrorBox } from './CatalogNotices';

export interface LinkCatalogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Account name the catalogue will be connected to. */
  account: string;
  accountText: string;
  onLinked: (catalog: Catalog) => void;
}

const LinkBody: React.FC<Omit<LinkCatalogDialogProps, 'open'>> = ({ onOpenChange, account, accountText, onLinked }) => {
  const [tab, setTab] = useState('pick');
  const [available, setAvailable] = useState<AvailableCatalog[] | null>(null);
  const [loadError, setLoadError] = useState<ActionErrorInfo | null>(null);
  const [metaId, setMetaId] = useState('');
  const [connect, setConnect] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ActionErrorInfo | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    setAvailable(null);
    try {
      setAvailable(readAvailable(await catalogService.available(account)));
    } catch (err) {
      setAvailable([]);
      setLoadError(describeActionError(err, 'Couldn’t list catalogues from Meta'));
    }
  }, [account]);

  useEffect(() => {
    void load();
  }, [load]);

  const link = async (id: string, doConnect: boolean) => {
    const trimmed = id.trim();
    if (!/^\d{5,30}$/.test(trimmed)) {
      setError({ message: 'A catalogue ID is a long number, e.g. 1234567890123456.' });
      return;
    }
    setBusy(trimmed);
    setError(null);
    try {
      const res = await catalogService.link({ whatsapp_account: account, meta_catalog_id: trimmed, connect: doConnect });
      onLinked(readCatalog(res));
    } catch (err) {
      if (handleUpgradeError(err)) setError({ message: 'Upgrade your plan to link a catalogue.' });
      else setError(describeActionError(err, 'Failed to link catalogue'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Link a catalogue</DialogTitle>
        <DialogDescription>
          Connect a Commerce Manager catalogue to {accountText}. A WhatsApp number shows one catalogue at a time —
          connecting a new one replaces the current one.
        </DialogDescription>
      </DialogHeader>

      <Tabs value={tab} onValueChange={setTab} className="py-3">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="pick">Choose from Meta</TabsTrigger>
          <TabsTrigger value="id">Enter catalogue ID</TabsTrigger>
        </TabsList>

        <TabsContent value="pick" className="mt-3">
          {available === null ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-white/50 light:text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Asking Meta…
            </div>
          ) : loadError ? (
            <div className="space-y-2">
              <ActionErrorBox error={loadError} />
              <Button size="sm" variant="outline" className="border-white/10 light:border-gray-200" onClick={load}>
                <RefreshCw className="h-4 w-4 mr-2" /> Try again
              </Button>
            </div>
          ) : available.length === 0 ? (
            <p className="py-6 text-center text-xs text-white/50 light:text-gray-500">
              Meta returned no catalogues for this number’s business. Create one in Commerce Manager, or enter its ID.
            </p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {available.map((c) => (
                <li
                  key={c.meta_catalog_id}
                  className="flex items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 light:border-gray-200 light:bg-white"
                >
                  <Store className="h-4 w-4 shrink-0 text-emerald-400 light:text-emerald-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white light:text-gray-900">{c.name || 'Untitled catalogue'}</p>
                    <p className="truncate font-mono text-[11px] text-white/40 light:text-gray-500">{c.meta_catalog_id}</p>
                  </div>
                  {c.is_connected && c.local_id ? (
                    <span className="text-[11px] font-medium text-emerald-400 light:text-emerald-700">Connected</span>
                  ) : (
                    <Button
                      size="sm"
                      disabled={!!busy}
                      onClick={() => link(c.meta_catalog_id, true)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                      {busy === c.meta_catalog_id ? 'Connecting…' : c.is_connected ? 'Add here' : 'Connect'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="id" className="mt-3 space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="meta-catalog-id" className="text-xs">Catalogue ID</Label>
            <Input
              id="meta-catalog-id"
              inputMode="numeric"
              placeholder="e.g. 1234567890123456"
              value={metaId}
              onChange={(e) => setMetaId(e.target.value.replace(/\s/g, ''))}
              className="font-mono bg-white/[0.04] border-white/[0.08] text-white light:bg-white light:border-gray-200 light:text-gray-900"
            />
            <p className="text-[11px] text-white/40 light:text-gray-500">
              Commerce Manager → your catalogue → Settings. The number’s access token must be able to see this catalogue.
            </p>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] px-3 py-2 light:border-gray-200">
            <span className="text-xs text-white/80 light:text-gray-700">Connect it to this WhatsApp number</span>
            <Switch checked={connect} onCheckedChange={setConnect} />
          </label>
        </TabsContent>
      </Tabs>

      <ActionErrorBox error={error} />

      <DialogFooter className="gap-2 sm:gap-0 pt-2">
        <Button type="button" variant="outline" disabled={!!busy} onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        {tab === 'id' && (
          <Button
            type="button"
            disabled={!!busy || !metaId.trim()}
            onClick={() => link(metaId, connect)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            <Link2 className="h-4 w-4 mr-2" />
            {busy ? 'Linking…' : 'Link catalogue'}
          </Button>
        )}
      </DialogFooter>
    </>
  );
};

export const LinkCatalogDialog: React.FC<LinkCatalogDialogProps> = ({ open, onOpenChange, ...rest }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[520px]">{open && <LinkBody onOpenChange={onOpenChange} {...rest} />}</DialogContent>
  </Dialog>
);
