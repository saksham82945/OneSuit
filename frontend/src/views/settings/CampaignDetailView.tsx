import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { CampaignManageView } from '@/views/campaigns/CampaignManageView';

// /campaigns/:id is the campaign management page. New campaigns are made in
// the wizard at /campaigns/new (CampaignWizardView).
export const CampaignDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  if (!id || id === 'new') return <Navigate to="/campaigns/new" replace />;
  return <CampaignManageView key={id} id={id} />;
};

export default CampaignDetailView;
