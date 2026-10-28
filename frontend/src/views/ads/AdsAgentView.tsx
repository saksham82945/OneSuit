import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Wand2 } from 'lucide-react';
import { useAdsSetup } from './adsApi';
import { AdsPage } from './AdsPageShell';
import { AdGenerator } from './AdGenerator';

/** Ads Agent: describe the business and get ready-to-run ad drafts. */
export const AdsAgentView: React.FC = () => {
  const { setup } = useAdsSetup();

  return (
    <AdsPage title="Ads Agent" setup={setup}>
      <section className="relative overflow-hidden rounded-2xl bg-spruce-dark px-5 py-6 text-white shadow-sm sm:px-7">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/[0.06]" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              <Wand2 className="h-3 w-3" /> AI
            </span>
            <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">Ready-to-run ads in minutes</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-white/75 sm:text-sm">
              Tell the agent about your business, website and audience. It writes several ad variants with a suggested objective and audience —
              save the ones you like as drafts.
            </p>
          </div>
          <Link to="/ads" className="inline-flex items-center gap-1 text-xs font-semibold text-white/90 hover:underline">
            View your ads <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      <AdGenerator pageName={setup?.page_name} />
    </AdsPage>
  );
};

export default AdsAgentView;
