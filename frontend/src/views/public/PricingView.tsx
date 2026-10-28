import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Compass, Loader2, Lock, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  useBranding,
  formatPrice,
  intervalSuffix,
  isExplorer,
  planLimits,
  useDocumentTitle,
  usePublicPlans,
  useSignedInUser,
  type PublicPlan,
} from './publicApi';
import { FormAlert, HeaderLink, PublicShell, cardClass } from './PublicLayout';

/** Which plan gets the subtle highlight: the platform default, else the middle one (3+ plans). */
function highlightedPlanId(plans: PublicPlan[], defaultPlan: string): string | null {
  if (defaultPlan && plans.some((p) => p.id === defaultPlan)) return defaultPlan;
  if (plans.length >= 3) return plans[Math.floor((plans.length - 1) / 2)].id;
  return null;
}

function gridClass(count: number): string {
  if (count === 1) return 'mx-auto max-w-md grid-cols-1';
  if (count === 2) return 'mx-auto max-w-4xl grid-cols-1 md:grid-cols-2';
  if (count === 3) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
  return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4';
}

interface PlanCardProps {
  plan: PublicPlan;
  highlighted: boolean;
  signupEnabled: boolean;
  trialDays: number;
}

const PlanCard: React.FC<PlanCardProps> = ({ plan, highlighted, signupEnabled, trialDays }) => {
  const suffix = intervalSuffix(plan);
  return (
    <div
      className={cn(
        cardClass,
        'relative flex flex-col p-6 sm:p-7 transition-colors',
        highlighted
          ? 'border-emerald-500/40 bg-gradient-to-b from-emerald-500/[0.07] to-[#141415] shadow-[0_0_0_1px_rgba(16,185,129,0.12),0_20px_60px_-20px_rgba(16,185,129,0.25)] light:border-emerald-400 light:from-emerald-50 light:to-white'
          : 'hover:border-white/[0.14] light:hover:border-gray-300'
      )}
    >
      {highlighted && (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-[#0f1f19] px-2.5 py-0.5 text-[11px] font-medium text-emerald-300 light:bg-emerald-50 light:text-emerald-700 light:border-emerald-200">
          <Sparkles className="h-3 w-3" />
          Recommended
        </span>
      )}

      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold text-white light:text-gray-900">{plan.name}</h3>
        {plan.description && (
          <p className="text-sm leading-relaxed text-white/50 light:text-gray-500">{plan.description}</p>
        )}
      </div>

      <div className="mt-6 flex items-baseline gap-1">
        <span className="text-4xl font-semibold tracking-tight text-white light:text-gray-900">
          {formatPrice(plan)}
        </span>
        {suffix && <span className="text-sm text-white/40 light:text-gray-500">{suffix}</span>}
      </div>
      {plan.price > 0 && plan.interval === 'yearly' && (
        <p className="mt-1 text-xs text-white/35 light:text-gray-400">Billed yearly</p>
      )}

      <dl className="mt-6 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-white/[0.02] text-sm light:divide-gray-100 light:border-gray-200 light:bg-gray-50">
        {planLimits(plan).map((limit) => (
          <div key={limit.label} className="flex items-center justify-between px-3.5 py-2">
            <dt className="text-white/50 light:text-gray-500">{limit.label}</dt>
            <dd
              className={cn(
                'font-medium tabular-nums',
                limit.value === 'Unlimited'
                  ? 'text-emerald-300 light:text-emerald-700'
                  : 'text-white/90 light:text-gray-900'
              )}
            >
              {limit.value}
            </dd>
          </div>
        ))}
      </dl>

      {plan.features.length > 0 && (
        <ul className="mt-6 space-y-2.5 text-sm">
          {plan.features.map((feature, i) => (
            <li key={`${feature}-${i}`} className="flex gap-2.5 text-white/75 light:text-gray-700">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 light:bg-emerald-100">
                <Check className="h-3 w-3 text-emerald-400 light:text-emerald-600" strokeWidth={3} />
              </span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-8">
        {signupEnabled ? (
          <Button
            asChild
            className={cn(
              'h-10 w-full font-medium',
              highlighted
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500'
                : 'border border-white/[0.1] bg-white/[0.04] text-white hover:bg-white/[0.08] light:border-gray-200 light:bg-white light:text-gray-900 light:hover:bg-gray-50'
            )}
          >
            <Link to={`/signup?plan=${encodeURIComponent(plan.id)}`}>
              {trialDays > 0 ? 'Start free trial' : 'Get started'}
            </Link>
          </Button>
        ) : (
          <div className="flex h-10 items-center justify-center gap-2 rounded-lg border border-dashed border-white/[0.1] text-sm text-white/40 light:border-gray-300 light:text-gray-500">
            <Lock className="h-3.5 w-3.5" />
            Sign-ups closed
          </div>
        )}
      </div>
    </div>
  );
};

const PlanCardSkeleton: React.FC = () => (
  <div className={cn(cardClass, 'flex flex-col p-7 animate-pulse')} aria-hidden>
    <div className="h-5 w-24 rounded bg-white/[0.06] light:bg-gray-100" />
    <div className="mt-3 h-4 w-3/4 rounded bg-white/[0.04] light:bg-gray-50" />
    <div className="mt-6 h-9 w-28 rounded bg-white/[0.06] light:bg-gray-100" />
    <div className="mt-6 h-24 rounded-xl bg-white/[0.03] light:bg-gray-50" />
    <div className="mt-6 space-y-3">
      <div className="h-4 w-2/3 rounded bg-white/[0.04] light:bg-gray-50" />
      <div className="h-4 w-1/2 rounded bg-white/[0.04] light:bg-gray-50" />
      <div className="h-4 w-3/5 rounded bg-white/[0.04] light:bg-gray-50" />
    </div>
    <div className="mt-8 h-10 rounded-lg bg-white/[0.05] light:bg-gray-50" />
  </div>
);

export const PricingView: React.FC = () => {
  const { info, loading, error, reload } = usePublicPlans();
  const branding = useBranding();
  const platformName = branding.platform_name;
  const plans = info?.plans ?? [];
  const trialDays = info?.trial_days ?? 0;
  const signupEnabled = info?.signup_enabled ?? true;
  const supportEmail = branding.support_email;
  const highlighted = highlightedPlanId(plans, info?.default_plan ?? '');
  // Explorers already have a login: plan buttons lead to the upgrade form on /signup.
  const exploring = isExplorer(useSignedInUser());
  const showExploreCta = !!info?.explore_enabled && !exploring;

  useDocumentTitle(`Pricing · ${platformName}`);

  return (
    <PublicShell
      headerActions={
        exploring ? (
          <HeaderLink to="/">Back to the demo</HeaderLink>
        ) : (
          <HeaderLink to="/login">Sign in</HeaderLink>
        )
      }
    >
      <section className="mx-auto max-w-3xl px-4 pt-14 pb-10 text-center sm:px-6 sm:pt-20 sm:pb-14">
        <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-1 text-xs font-medium text-emerald-300 light:border-emerald-200 light:bg-emerald-50 light:text-emerald-700">
          Pricing
        </span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-5xl light:text-gray-900">
          {loading && !info ? (
            <span className="inline-block h-10 w-3/4 animate-pulse rounded-lg bg-white/[0.05] align-middle sm:h-12 light:bg-gray-50" />
          ) : signupEnabled && trialDays > 0 ? (
            <>
              Start your {trialDays}-day free trial,{' '}
              <span className="bg-gradient-to-r from-emerald-300 to-green-400 bg-clip-text text-transparent light:from-emerald-600 light:to-green-600">
                no card needed
              </span>
            </>
          ) : (
            'Simple plans for every team'
          )}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-white/50 sm:text-lg light:text-gray-500">
          Everything your team needs to talk to customers on WhatsApp. Pick the plan that fits how
          many people, contacts and numbers you have.
        </p>
        {exploring && (
          <p className="mx-auto mt-6 inline-flex max-w-xl items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-1.5 text-sm text-emerald-200 light:border-emerald-200 light:bg-emerald-50 light:text-emerald-800">
            <Compass className="h-4 w-4 shrink-0" />
            You're exploring the demo. Pick a plan to get your own workspace.
          </p>
        )}
        {showExploreCta && (
          <p className="mt-6 text-sm text-white/45 light:text-gray-500">
            Not ready yet?{' '}
            <Link
              to="/explore"
              className="group inline-flex items-center gap-1 font-medium text-emerald-400 underline-offset-4 hover:text-emerald-300 hover:underline light:text-emerald-600"
            >
              Explore the demo first
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <span className="mt-1 block text-xs text-white/35 sm:mt-0 sm:inline light:text-gray-400">
              <span aria-hidden className="mx-2 hidden sm:inline">
                ·
              </span>
              Look around with sample data, no plan or card needed
            </span>
          </p>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        {!signupEnabled && info && (
          <FormAlert tone="info" className="mx-auto mb-8 max-w-2xl">
            <p className="font-medium">New sign-ups are currently closed.</p>
            <p className="text-amber-100/70 light:text-amber-800/80">
              {supportEmail ? (
                <>
                  To get access, contact{' '}
                  <a href={`mailto:${supportEmail}`} className="underline underline-offset-2">
                    {supportEmail}
                  </a>
                  . Already a customer?{' '}
                </>
              ) : (
                <>Already a customer? </>
              )}
              <Link to="/login" className="underline underline-offset-2">
                Sign in
              </Link>
              .
            </p>
          </FormAlert>
        )}

        {loading && !info ? (
          <div className={cn('grid gap-6', gridClass(3))}>
            <PlanCardSkeleton />
            <PlanCardSkeleton />
            <PlanCardSkeleton />
          </div>
        ) : error && !info ? (
          <div className={cn(cardClass, 'mx-auto max-w-md p-8 text-center')}>
            <p className="font-medium text-white light:text-gray-900">Plans didn't load</p>
            <p className="mt-1 text-sm text-white/50 light:text-gray-500">{error}</p>
            <Button
              onClick={() => void reload()}
              disabled={loading}
              className="mt-5 bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Try again
            </Button>
          </div>
        ) : plans.length === 0 ? (
          <div className={cn(cardClass, 'mx-auto max-w-md p-8 text-center')}>
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 light:bg-emerald-50">
              <Sparkles className="h-5 w-5 text-emerald-400 light:text-emerald-600" />
            </div>
            <p className="font-medium text-white light:text-gray-900">Plans are coming soon</p>
            <p className="mt-1 text-sm text-white/50 light:text-gray-500">
              {supportEmail ? (
                <>
                  We're putting the finishing touches on our plans. In the meantime, contact{' '}
                  <a
                    href={`mailto:${supportEmail}`}
                    className="text-emerald-400 hover:text-emerald-300 light:text-emerald-600"
                  >
                    {supportEmail}
                  </a>
                  .
                </>
              ) : (
                "We're putting the finishing touches on our plans. Please check back soon."
              )}
            </p>
          </div>
        ) : (
          <div className={cn('grid gap-6', gridClass(plans.length))}>
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                highlighted={plan.id === highlighted}
                signupEnabled={signupEnabled}
                trialDays={trialDays}
              />
            ))}
          </div>
        )}

        {plans.length > 0 && signupEnabled && (
          <p className="mt-10 text-center text-sm text-white/40 light:text-gray-500">
            {trialDays > 0
              ? `Every plan starts with a ${trialDays}-day free trial. No credit card required.`
              : 'No credit card required to get started.'}
            {!exploring && (
              <>
                {' '}
                Already have an account?{' '}
                <Link
                  to="/login"
                  className="font-medium text-emerald-400 underline-offset-4 hover:text-emerald-300 hover:underline light:text-emerald-600"
                >
                  Sign in
                </Link>
              </>
            )}
          </p>
        )}
      </section>
    </PublicShell>
  );
};

export default PricingView;
