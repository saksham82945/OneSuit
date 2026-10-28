import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, templatesService, accountsService } from '@/services/api';
import { readData, readList, readTotal } from '@/services/response';
import { SearchInput } from '@/components/shared/SearchInput';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { IconButton } from '@/components/shared/IconButton';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Plus, RefreshCw, Pencil, Trash2, MessageSquare, Image, Video, FileCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export interface Template {
  id: string;
  whatsapp_account?: string;
  meta_template_id?: string;
  name: string;
  display_name?: string;
  language: string;
  category: string;
  status: string;
  header_type?: string;
  header_content?: string;
  body_content?: string;
  footer_content?: string;
  buttons?: Array<Record<string, unknown>>;
  sample_values?: Array<Record<string, unknown>>;
  quality_rating?: string;
  created_at?: string;
  updated_at?: string;
  components?: Array<{ type?: string; format?: string; text?: string }>;
}

const PAGE_SIZE = 50;

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' && message ? message : fallback;
}

export const TemplatesView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await templatesService.list({
        search: searchQuery || undefined,
        page: currentPage,
        limit: PAGE_SIZE,
      });
      setTemplates(readList<Template>(res, 'templates'));
      setTotalItems(readTotal(res, 'templates'));
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load message templates'));
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, currentPage]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const syncFromMeta = async () => {
    setIsSyncing(true);
    try {
      const accountNames = readList<{ name?: string }>(await accountsService.list(), 'accounts')
        .map((a) => a.name)
        .filter((name): name is string => !!name);
      if (accountNames.length === 0) {
        toast.error('Add a WhatsApp account first to sync templates from Meta');
        return;
      }

      let synced = 0;
      const failures: string[] = [];
      for (const accountName of accountNames) {
        try {
          const res = await api.post('/templates/sync', { whatsapp_account: accountName });
          const count = readData<{ count?: number }>(res)?.count;
          synced += typeof count === 'number' ? count : 0;
        } catch (err) {
          failures.push(`${accountName}: ${errorMessage(err, 'sync failed')}`);
        }
      }

      if (failures.length < accountNames.length) {
        toast.success(`Synced ${synced} template${synced === 1 ? '' : 's'} from WhatsApp`);
      }
      if (failures.length > 0) {
        toast.error(`Sync failed for ${failures.join('; ')}`);
      }
      fetchTemplates();
    } catch (err) {
      toast.error(errorMessage(err, 'Sync failed'));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;
    setIsDeleting(true);
    try {
      await templatesService.delete(templateToDelete.id);
      toast.success('Template deleted');
      setTemplateToDelete(null);
      fetchTemplates();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete template'));
    } finally {
      setIsDeleting(false);
    }
  };

  const getHeaderType = (tpl: Template): string => {
    const type = (tpl.header_type || tpl.components?.find((c) => c.type === 'HEADER')?.format || '').toUpperCase();
    return type && type !== 'NONE' ? type : 'NONE';
  };

  const getStatusBadge = (status: string) => {
    switch ((status || '').toUpperCase()) {
      case 'APPROVED':
        return (
          <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200/60 font-semibold text-[10px] dark:bg-emerald-950/60 dark:text-emerald-300">
            APPROVED
          </Badge>
        );
      case 'PENDING':
        return (
          <Badge className="bg-amber-50 text-amber-800 border border-amber-200/60 font-semibold text-[10px] dark:bg-amber-950/60 dark:text-amber-300">
            PENDING
          </Badge>
        );
      case 'REJECTED':
        return (
          <Badge className="bg-rose-50 text-rose-800 border border-rose-200/60 font-semibold text-[10px] dark:bg-rose-950/60 dark:text-rose-300">
            REJECTED
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-[10px] font-semibold uppercase">
            {status}
          </Badge>
        );
    }
  };

  const getCategoryBadge = (category: string) => {
    switch ((category || '').toUpperCase()) {
      case 'MARKETING':
        return (
          <Badge className="bg-purple-50 text-purple-800 border border-purple-200/60 font-semibold text-[10px] dark:bg-purple-950/60 dark:text-purple-300">
            MARKETING
          </Badge>
        );
      case 'UTILITY':
        return (
          <Badge className="bg-teal-50 text-teal-800 border border-teal-200/60 font-semibold text-[10px] dark:bg-teal-950/60 dark:text-teal-300">
            UTILITY
          </Badge>
        );
      case 'AUTHENTICATION':
        return (
          <Badge className="bg-blue-50 text-blue-800 border border-blue-200/60 font-semibold text-[10px] dark:bg-blue-950/60 dark:text-blue-300">
            AUTHENTICATION
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-[10px] font-semibold">
            {category}
          </Badge>
        );
    }
  };

  const getHeaderIcon = (type?: string) => {
    switch (type) {
      case 'IMAGE':
        return <Image className="h-3.5 w-3.5 text-blue-500 mr-1.5 inline shrink-0" />;
      case 'VIDEO':
        return <Video className="h-3.5 w-3.5 text-purple-500 mr-1.5 inline shrink-0" />;
      case 'DOCUMENT':
        return <FileCheck className="h-3.5 w-3.5 text-emerald-500 mr-1.5 inline shrink-0" />;
      default:
        return <MessageSquare className="h-3.5 w-3.5 text-gray-400 mr-1.5 inline shrink-0" />;
    }
  };

  const filteredTemplates = useMemo(() => {
    if (selectedCategory === 'ALL') return templates;
    return templates.filter((t) => (t.category || '').toUpperCase() === selectedCategory);
  }, [templates, selectedCategory]);

  const columns: Column<Template>[] = [
    {
      key: 'name',
      label: t('templates.name') || 'Template Name',
      sortable: true,
      render: (tpl) => (
        <div className="flex flex-col">
          <Link
            to={`/templates/${tpl.id}`}
            className="font-semibold text-xs text-gray-900 dark:text-white hover:text-teal-700 dark:hover:text-teal-400 transition-colors"
          >
            {tpl.display_name || tpl.name}
          </Link>
          <span className="text-[11px] font-mono text-gray-400">{tpl.name}</span>
        </div>
      ),
    },
    {
      key: 'category',
      label: t('templates.category') || 'Category',
      sortable: true,
      render: (tpl) => getCategoryBadge(tpl.category),
    },
    {
      key: 'status',
      label: t('templates.status') || 'Status',
      sortable: true,
      render: (tpl) => getStatusBadge(tpl.status),
    },
    {
      key: 'language',
      label: t('templates.language') || 'Language',
      render: (tpl) => (
        <span className="text-xs text-gray-600 dark:text-gray-300 font-medium uppercase font-mono">
          {tpl.language}
        </span>
      ),
    },
    {
      key: 'header',
      label: t('templates.header') || 'Header',
      render: (tpl) => (
        <div className="flex items-center text-xs text-gray-600 dark:text-gray-300">
          {getHeaderIcon(getHeaderType(tpl))}
          <span>{getHeaderType(tpl)}</span>
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (tpl) => (
        <div className="flex items-center justify-end gap-1">
          <Link to={`/templates/${tpl.id}`}>
            <IconButton icon={Pencil} label="Edit / Preview" className="text-gray-500 hover:text-gray-900 dark:hover:text-white" />
          </Link>
          <IconButton
            icon={Trash2}
            label="Delete"
            className="text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            onClick={() => setTemplateToDelete(tpl)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#f8faf9] text-gray-900 overflow-y-auto">
      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Templates Directory Card */}
        <div className="rounded-2xl border border-gray-200/90 bg-white dark:bg-[#141b1a] dark:border-[#1e2a28] shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold text-gray-900 dark:text-white">
                  {t('templates.title') || 'Message Templates'}
                </h2>
                <Badge className="bg-teal-50 text-teal-700 border-teal-200 font-semibold text-[11px] px-2 py-0.5 rounded-full dark:bg-teal-950/60 dark:text-teal-300">
                  {totalItems} verified
                </Badge>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {t('templates.subtitle') || 'Create, submit and sync verified WhatsApp HSM message templates with Meta Cloud API'}
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <SearchInput
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Search templates..."
                className="w-64"
              />

              <Button
                variant="outline"
                size="sm"
                disabled={isSyncing}
                onClick={syncFromMeta}
                className="h-9 rounded-xl border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 text-gray-500 ${isSyncing ? 'animate-spin' : ''}`} />
                {t('templates.syncFromMeta') || 'Sync from Meta'}
              </Button>

              <Button
                size="sm"
                className="h-9 rounded-xl bg-spruce-dark hover:bg-spruce text-white text-xs font-semibold px-4 shadow-sm"
                onClick={() => navigate('/templates/new')}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                {t('templates.createTemplate') || 'Create Template'}
              </Button>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            {[
              { id: 'ALL', label: 'All Categories' },
              { id: 'MARKETING', label: 'Marketing' },
              { id: 'UTILITY', label: 'Utility' },
              { id: 'AUTHENTICATION', label: 'Authentication' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all select-none ${
                  selectedCategory === cat.id
                    ? 'subnav-pill-active shadow-xs'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-white/[0.04] dark:text-gray-400'
                }`}
              >
                {cat.label}
              </button>
            ))}

            <div className="h-4 w-px bg-gray-200 dark:bg-white/10 mx-1 shrink-0" />

            <div className="flex items-center gap-1.5 shrink-0">
              <Badge className="bg-amber-50 text-amber-800 border-amber-200 text-[10px] font-semibold cursor-pointer hover:bg-amber-100 transition-colors">
                🔥 Trending Templates
              </Badge>
              <Badge className="bg-purple-50 text-purple-800 border-purple-200 text-[10px] font-semibold cursor-pointer hover:bg-purple-100 transition-colors">
                ⚡ High ROI
              </Badge>
            </div>
          </div>

          <DataTable
            items={filteredTemplates}
            columns={columns}
            isLoading={isLoading}
            currentPage={currentPage}
            totalItems={totalItems}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
            emptyIcon={FileText}
            emptyTitle="No templates found"
            emptyDescription="Sync from Meta or create a new template to get started"
            emptyAction={
              <Button
                size="sm"
                className="bg-spruce-dark hover:bg-spruce text-white text-xs font-semibold rounded-xl"
                onClick={() => navigate('/templates/new')}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Create Template
              </Button>
            }
          />
        </div>
      </div>

      <DeleteConfirmDialog
        open={!!templateToDelete}
        onOpenChange={(open) => !open && setTemplateToDelete(null)}
        title="Delete Template"
        itemName={templateToDelete?.display_name || templateToDelete?.name}
        isSubmitting={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
};

export default TemplatesView;
