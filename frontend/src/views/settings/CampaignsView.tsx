import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { campaignsService } from '@/services/api';
import { readList, readTotal } from '@/services/response';
import { SearchInput } from '@/components/shared/SearchInput';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { IconButton } from '@/components/shared/IconButton';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { HeroBanner } from '@/components/shared/HeroBanner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Megaphone, Plus, Pencil, Trash2, Users, CheckCircle2, Clock, AlertCircle, Play } from 'lucide-react';
import { toast } from 'sonner';

export interface Campaign {
  id: string;
  name: string;
  whatsapp_account?: string;
  template_id?: string;
  template_name?: string;
  status: 'draft' | 'scheduled' | 'queued' | 'processing' | 'paused' | 'completed' | 'cancelled' | 'failed' | 'running';
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count?: number;
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at?: string;
}

const PAGE_SIZE = 50;

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' && message ? message : fallback;
}

export const CampaignsView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await campaignsService.list({
        search: searchQuery || undefined,
        page: currentPage,
        limit: PAGE_SIZE,
      });
      setCampaigns(readList<Campaign>(res, 'campaigns'));
      setTotalItems(readTotal(res, 'campaigns'));
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load campaigns'));
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, currentPage]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleDelete = async () => {
    if (!campaignToDelete) return;
    setIsDeleting(true);
    try {
      await campaignsService.delete(campaignToDelete.id);
      toast.success('Campaign deleted');
      setCampaignToDelete(null);
      fetchCampaigns();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete campaign'));
    } finally {
      setIsDeleting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200/60 font-semibold text-[10px] flex items-center gap-1 dark:bg-emerald-950/60 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" /> COMPLETED
          </Badge>
        );
      case 'processing':
      case 'running':
      case 'queued':
        return (
          <Badge className="bg-blue-50 text-blue-800 border border-blue-200/60 font-semibold text-[10px] flex items-center gap-1 dark:bg-blue-950/60 dark:text-blue-300">
            <Play className="h-3 w-3" /> RUNNING
          </Badge>
        );
      case 'scheduled':
        return (
          <Badge className="bg-amber-50 text-amber-800 border border-amber-200/60 font-semibold text-[10px] flex items-center gap-1 dark:bg-amber-950/60 dark:text-amber-300">
            <Clock className="h-3 w-3" /> SCHEDULED
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-rose-50 text-rose-800 border border-rose-200/60 font-semibold text-[10px] flex items-center gap-1 dark:bg-rose-950/60 dark:text-rose-300">
            <AlertCircle className="h-3 w-3" /> FAILED
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-[10px] uppercase font-semibold">
            {status || 'DRAFT'}
          </Badge>
        );
    }
  };

  const columns: Column<Campaign>[] = [
    {
      key: 'name',
      label: t('campaigns.campaign') || 'Campaign',
      sortable: true,
      render: (c) => (
        <div className="flex flex-col">
          <Link
            to={`/campaigns/${c.id}`}
            className="font-semibold text-xs text-gray-900 dark:text-white hover:text-teal-700 dark:hover:text-teal-400 transition-colors"
          >
            {c.name}
          </Link>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">
            Template: {c.template_name || 'None'}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      label: t('campaigns.status') || 'Status',
      sortable: true,
      render: (c) => getStatusBadge(c.status),
    },
    {
      key: 'stats',
      label: t('campaigns.progress') || 'Progress & Metrics',
      render: (c) => (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-gray-600 dark:text-gray-300 font-medium" title="Audience">
            <Users className="h-3.5 w-3.5 inline mr-1 text-gray-400" />
            {c.total_recipients || 0}
          </span>
          <span className="text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-emerald-200/50" title="Delivered">
            ✓ {c.delivered_count || 0}
          </span>
          <span className="text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-blue-200/50" title="Read">
            👁 {c.read_count || 0}
          </span>
          {(c.failed_count || 0) > 0 && (
            <span className="text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-rose-200/50" title="Failed">
              ✕ {c.failed_count}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'created_at',
      label: t('campaigns.created') || 'Created At',
      sortable: true,
      render: (c) => (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (c) => (
        <div className="flex items-center justify-end gap-1">
          <Link to={`/campaigns/${c.id}`}>
            <IconButton icon={Pencil} label="Edit / Details" className="text-gray-500 hover:text-gray-900 dark:hover:text-white" />
          </Link>
          <IconButton
            icon={Trash2}
            label="Delete"
            className="text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            onClick={() => setCampaignToDelete(c)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#f8faf9] text-gray-900 overflow-y-auto">
      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* AI Nebula Hero Banner */}
        <HeroBanner
          title="Meet Campaign Agent, your AI campaign manager"
          description="Describe your audience & goal once. AI crafts high-converting copy and optimizes broadcast scheduling for maximum read rates."
          badge="AI POWERED"
          actionText="Create Campaign"
          onAction={() => navigate('/campaigns/new')}
        />

        {/* Campaigns Directory Card */}
        <div className="rounded-2xl border border-gray-200/90 bg-white dark:bg-[#141b1a] dark:border-[#1e2a28] shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold text-gray-900 dark:text-white">
                  {t('campaigns.yourCampaigns') || 'Broadcast Campaigns'}
                </h2>
                <Badge className="bg-teal-50 text-teal-700 border-teal-200 font-semibold text-[11px] px-2 py-0.5 rounded-full dark:bg-teal-950/60 dark:text-teal-300">
                  {totalItems} total
                </Badge>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Track delivery progress, read receipts and engagement metrics in real-time
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <SearchInput
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Search campaigns..."
                className="w-64"
              />

              <Button
                size="sm"
                className="h-9 rounded-xl bg-spruce-dark hover:bg-spruce text-white text-xs font-semibold px-4 shadow-sm"
                onClick={() => navigate('/campaigns/new')}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                {t('campaigns.createCampaign') || 'New Campaign'}
              </Button>
            </div>
          </div>

          <DataTable
            items={campaigns}
            columns={columns}
            isLoading={isLoading}
            currentPage={currentPage}
            totalItems={totalItems}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
            emptyIcon={Megaphone}
            emptyTitle="No campaigns found"
            emptyDescription="Schedule your first broadcast to reach your audience with verified templates"
            emptyAction={
              <Button
                size="sm"
                className="bg-spruce-dark hover:bg-spruce text-white text-xs font-semibold rounded-xl"
                onClick={() => navigate('/campaigns/new')}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                New Campaign
              </Button>
            }
          />
        </div>
      </div>

      <DeleteConfirmDialog
        open={!!campaignToDelete}
        onOpenChange={(open) => !open && setCampaignToDelete(null)}
        title="Delete Campaign"
        itemName={campaignToDelete?.name}
        isSubmitting={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
};

export default CampaignsView;
