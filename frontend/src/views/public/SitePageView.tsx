import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { siteContentService, usePublicSite } from '@/services/siteContent';
import { useBrandedTitle } from '@/services/branding';
import { Reveal, RichText, SiteAnimations, SiteFooter, SiteHeader, type NavLinkItem } from './site/SiteKit';

/** A published website page (privacy policy, terms, about us...) at /p/:slug. */
export const SitePageView: React.FC = () => {
  const { slug = '' } = useParams();
  const { content, pages } = usePublicSite();
  const [page, setPage] = useState<{ title: string; content: string; updated_at: string } | null>(null);
  const [missing, setMissing] = useState(false);
  useBrandedTitle(page?.title);

  useEffect(() => {
    let alive = true;
    setPage(null);
    setMissing(false);
    window.scrollTo(0, 0);
    siteContentService
      .getPublicPage(slug)
      .then((p) => alive && setPage(p))
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [slug]);

  const nav = useMemo<NavLinkItem[]>(
    () =>
      [
        content.show_features && { label: 'Features', section: 'features' },
        content.show_pricing && { label: 'Pricing', section: 'pricing' },
        content.show_faq && { label: 'FAQ', section: 'faq' },
        { label: 'Contact', section: 'contact' },
      ].filter(Boolean) as NavLinkItem[],
    [content]
  );

  return (
    <SiteAnimations content={content}>
      <div className="min-h-screen flex flex-col bg-white text-gray-900 dark:bg-[#080d11] dark:text-white antialiased">
        <SiteHeader content={content} pages={pages} nav={nav} />
        <main className="flex-1">
          <div className="relative overflow-hidden border-b border-gray-100 dark:border-white/[0.06] bg-gradient-to-b from-emerald-50/80 to-white dark:from-emerald-950/20 dark:to-transparent">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
              <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#27c462]">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to home
              </Link>
              <Reveal>
                <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight font-ubuntu">
                  {page?.title ?? (missing ? 'Page not found' : ' ')}
                </h1>
                {page?.updated_at && (
                  <p className="mt-2 text-xs text-gray-500">
                    Last updated {new Date(page.updated_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
              </Reveal>
            </div>
          </div>

          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
            {missing ? (
              <div className="text-center py-10">
                <FileText className="mx-auto h-10 w-10 text-gray-300" />
                <p className="mt-3 text-sm text-gray-500">This page isn't available.</p>
                <Link to="/" className="mt-4 inline-block rounded-full bg-[#27c462] px-5 py-2 text-sm font-semibold text-white">
                  Go to home
                </Link>
              </div>
            ) : page ? (
              <Reveal>
                <RichText text={page.content} />
              </Reveal>
            ) : (
              <p className="text-sm text-gray-400">Loading…</p>
            )}
          </div>
        </main>
        <SiteFooter content={content} pages={pages} nav={nav} />
      </div>
    </SiteAnimations>
  );
};

export default SitePageView;
