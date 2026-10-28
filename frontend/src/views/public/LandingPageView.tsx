import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Bot,
  Megaphone,
  QrCode,
  Users,
  Sparkles,
  Zap,
  Check,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Shield,
  Layers,
  Phone,
  Mail,
  MapPin,
  ExternalLink,
  Menu,
  X,
  FileText,
  Workflow,
  LogIn,
  Send,
  HelpCircle,
  Clock,
  TrendingUp,
  Headphones,
  Award,
  Sliders,
  Database,
  Smartphone,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useBranding, resolveAssetUrl } from '@/services/branding';
import { useSignedInUser } from './publicApi';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface PageModalContent {
  title: string;
  subtitle?: string;
  content: React.ReactNode;
}

export const LandingPageView: React.FC = () => {
  const branding = useBranding();
  const signedInUser = useSignedInUser();
  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [activeFlowIndex, setActiveFlowIndex] = useState(0);
  const [activeModalPage, setActiveModalPage] = useState<string | null>(null);

  // Auto-scroll on hash change
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const el = document.querySelector(hash);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    }
  }, []);

  const platformName = branding.platform_name || 'One Suit';
  const customLogoUrl = branding.logo_url ? resolveAssetUrl(branding.logo_url) : null;

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const openPageModal = (pageKey: string) => {
    setMobileMenuOpen(false);
    setActiveModalPage(pageKey);
  };

  const getPageModalDetails = (key: string): PageModalContent => {
    switch (key) {
      case 'terms':
        return {
          title: 'Terms of Service',
          subtitle: `Last updated: January 2026 • Governing your use of ${platformName}`,
          content: (
            <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              <p>
                Welcome to <strong>{platformName}</strong>. By accessing or using our website, services, and WhatsApp Business API integration platform, you agree to be bound by these Terms of Service.
              </p>
              <h4 className="text-base font-semibold text-gray-900 dark:text-white pt-2">1. Use of WhatsApp Business API</h4>
              <p>
                Our services facilitate access to the official Meta WhatsApp Cloud API. Users agree to comply with all applicable WhatsApp Business Messaging policies, terms, and guidelines. Spamming, bulk unconsented messaging, and abusive activities are strictly prohibited.
              </p>
              <h4 className="text-base font-semibold text-gray-900 dark:text-white pt-2">2. Account Registration and Security</h4>
              <p>
                You must provide accurate, complete information when creating an account. You are responsible for safeguarding your credentials, API tokens, and all activities under your account.
              </p>
              <h4 className="text-base font-semibold text-gray-900 dark:text-white pt-2">3. Subscription and Billing</h4>
              <p>
                Paid plans are billed in advance on a recurring monthly or annual basis. WhatsApp Cloud API message charges levied by Meta are separate and billed according to Meta platform pricing.
              </p>
              <h4 className="text-base font-semibold text-gray-900 dark:text-white pt-2">4. Limitation of Liability</h4>
              <p>
                {platformName} shall not be liable for any indirect, incidental, or consequential damages resulting from downtime, WhatsApp network disruptions, or account sanctions by Meta due to policy violations.
              </p>
            </div>
          ),
        };
      case 'privacy':
        return {
          title: 'Privacy Policy',
          subtitle: `How ${platformName} protects and manages your data`,
          content: (
            <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              <p>
                At <strong>{platformName}</strong>, your privacy and customer data integrity are paramount. This Privacy Policy outlines what information we collect and how it is protected.
              </p>
              <h4 className="text-base font-semibold text-gray-900 dark:text-white pt-2">1. Information We Collect</h4>
              <p>
                We collect your account profile (name, business email, contact phone), WhatsApp Business account credentials, and contact records stored on your workspace for sending messaging broadcasts.
              </p>
              <h4 className="text-base font-semibold text-gray-900 dark:text-white pt-2">2. How We Use Data</h4>
              <p>
                Your data is strictly used to deliver WhatsApp communication services, route inbound chats to team members, process bot workflows, and generate analytics. We never sell or rent your data.
              </p>
              <h4 className="text-base font-semibold text-gray-900 dark:text-white pt-2">3. Security and Storage</h4>
              <p>
                Sensitive keys and access secrets are stored using AES-256 encryption. We utilize industry-grade database isolation and secure SSL/TLS connections for all transmitted communications.
              </p>
            </div>
          ),
        };
      case 'shipping':
        return {
          title: 'Shipping & Delivery Policy',
          subtitle: 'Digital service fulfillment details',
          content: (
            <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              <p>
                <strong>{platformName}</strong> is a Software-as-a-Service (SaaS) cloud platform. We do not ship physical goods.
              </p>
              <h4 className="text-base font-semibold text-gray-900 dark:text-white pt-2">Instant Digital Activation</h4>
              <p>
                Upon successful signup and payment verification, your cloud workspace is provisioned immediately. You will receive an automated confirmation email with instructions to connect your WhatsApp Business account.
              </p>
              <p>
                If you encounter any delays in provisioning or access activation, contact our 24/7 technical helpdesk at {branding.support_email || 'support@onesuit.in'}.
              </p>
            </div>
          ),
        };
      case 'refund':
        return {
          title: 'Refund & Cancellation Policy',
          subtitle: 'Clear terms on cancellations and refunds',
          content: (
            <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              <p>
                We strive to provide the best WhatsApp marketing and automation experience. Please review our cancellation and refund guidelines below:
              </p>
              <h4 className="text-base font-semibold text-gray-900 dark:text-white pt-2">Cancellations</h4>
              <p>
                You may cancel your monthly or yearly recurring subscription at any time directly through your account dashboard or by contacting support. Your access will remain active until the end of your prepaid billing period.
              </p>
              <h4 className="text-base font-semibold text-gray-900 dark:text-white pt-2">Refund Policy</h4>
              <p>
                Due to the immediate provisioning of cloud infrastructure and API bandwidth, subscriptions are generally non-refundable once activated. In the event of billing discrepancies or proven technical system failure within 48 hours of initial purchase, contact our support team for a review.
              </p>
            </div>
          ),
        };
      case 'about':
        return {
          title: `About Us - ${platformName}`,
          subtitle: 'Empowering businesses with conversational WhatsApp automation',
          content: (
            <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              <p>
                <strong>{platformName}</strong> is a premier WhatsApp Marketing and Customer Engagement Platform built for modern enterprises, direct-to-consumer brands, and growing agencies.
              </p>
              <p>
                We simplify how businesses connect with their customers on the world's most popular messaging app. From instant broadcast campaigns and multi-agent inboxes to no-code visual bot flows and AI agent integrations, {platformName} provides everything your team needs under one roof.
              </p>
              <h4 className="text-base font-semibold text-gray-900 dark:text-white pt-2">Our Mission</h4>
              <p>
                To empower companies to turn conversations into conversions, build genuine customer relationships, and scale 24/7 support without complexity.
              </p>
            </div>
          ),
        };
      case 'contact':
      default:
        return {
          title: 'Contact Us',
          subtitle: "We're here to help you accelerate your business on WhatsApp",
          content: (
            <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-3">
                <div className="p-4 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.02]">
                  <div className="flex items-center gap-2 text-emerald-600 font-semibold mb-1">
                    <MapPin className="h-4 w-4" /> Address
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {branding.contact_address || 'Unit 15, Swapnshilp tower, Nashik 422101, Maharashtra, India'}
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.02]">
                  <div className="flex items-center gap-2 text-emerald-600 font-semibold mb-1">
                    <Phone className="h-4 w-4" /> Phone
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {branding.support_phone || '+91 8505917890'}
                  </p>
                </div>
              </div>
              <div className="p-4 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.02]">
                <div className="flex items-center gap-2 text-emerald-600 font-semibold mb-1">
                  <Mail className="h-4 w-4" /> Email Support
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {branding.support_email || 'support@onesuit.in'}
                </p>
              </div>
              <p className="pt-2 text-xs text-gray-500">
                Operating Hours: Monday – Saturday, 9:00 AM – 7:00 PM IST. Enterprise SLA customers receive 24/7 dedicated escalation support.
              </p>
            </div>
          ),
        };
    }
  };

  const modalDetails = activeModalPage ? getPageModalDetails(activeModalPage) : null;

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-[#080d11] dark:text-white font-sans antialiased selection:bg-emerald-500/20 selection:text-emerald-500">
      {/* Top Ambient Glow Effect */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[600px] z-0 opacity-40 dark:opacity-20 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(39,196,98,0.25),transparent)]"
      />

      {/* STICKY NAVBAR */}
      <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-white/85 dark:bg-[#080d11]/85 border-b border-gray-100 dark:border-white/[0.06] transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          {/* Logo & Brand Name */}
          <Link to="/" className="flex items-center gap-3 group">
            {customLogoUrl ? (
              <img
                src={customLogoUrl}
                alt={platformName}
                className="h-10 w-auto object-contain transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="flex items-center gap-2.5">
                <img
                  src="/landing/onesuit-logo.png"
                  alt={platformName}
                  className="h-10 w-auto object-contain transition-transform group-hover:scale-105"
                  onError={(e) => {
                    // Fallback to icon if logo file not loaded
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white font-ubuntu">
                  {platformName}
                </span>
              </div>
            )}
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-gray-700 dark:text-gray-200">
            <button
              onClick={() => scrollToSection('features')}
              className="hover:text-[#27c462] transition-colors cursor-pointer"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('solutions')}
              className="hover:text-[#27c462] transition-colors cursor-pointer"
            >
              Solutions
            </button>
            <button
              onClick={() => scrollToSection('flow-builder')}
              className="hover:text-[#27c462] transition-colors cursor-pointer"
            >
              Flow Builder
            </button>
            <button
              onClick={() => scrollToSection('pricing')}
              className="hover:text-[#27c462] transition-colors cursor-pointer"
            >
              Pricing
            </button>
            <button
              onClick={() => scrollToSection('faq')}
              className="hover:text-[#27c462] transition-colors cursor-pointer"
            >
              FAQ
            </button>

            {/* Pages Dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-1 hover:text-[#27c462] transition-colors py-2 cursor-pointer">
                <span>Pages</span>
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-hover:rotate-180" />
              </button>
              <div className="absolute right-0 top-full pt-2 opacity-0 translate-y-1 invisible group-hover:opacity-100 group-hover:translate-y-0 group-hover:visible transition-all duration-150 z-50">
                <div className="w-56 rounded-xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111b21] p-2 shadow-xl shadow-black/10">
                  <button
                    onClick={() => openPageModal('terms')}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 hover:text-[#27c462] transition-colors"
                  >
                    Terms of Service
                  </button>
                  <button
                    onClick={() => openPageModal('privacy')}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 hover:text-[#27c462] transition-colors"
                  >
                    Privacy Policy
                  </button>
                  <button
                    onClick={() => openPageModal('shipping')}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 hover:text-[#27c462] transition-colors"
                  >
                    Shipping & Delivery
                  </button>
                  <button
                    onClick={() => openPageModal('refund')}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 hover:text-[#27c462] transition-colors"
                  >
                    Refund Policy
                  </button>
                  <div className="my-1 border-t border-gray-100 dark:border-white/10" />
                  <button
                    onClick={() => openPageModal('about')}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 hover:text-[#27c462] transition-colors"
                  >
                    About Us
                  </button>
                  <button
                    onClick={() => openPageModal('contact')}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 hover:text-[#27c462] transition-colors"
                  >
                    Contact Us
                  </button>
                </div>
              </div>
            </div>
          </nav>

          {/* Right Action Buttons */}
          <div className="hidden sm:flex items-center gap-3">
            {signedInUser ? (
              <Button
                onClick={() => navigate('/dashboard')}
                className="bg-[#27c462] hover:bg-[#20b255] text-white rounded-full px-6 py-2.5 font-medium shadow-md shadow-emerald-500/20 text-sm flex items-center gap-2 cursor-pointer transition-all"
              >
                <span>Dashboard</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-full border border-[#27c462] text-[#27c462] hover:bg-[#27c462] hover:text-white px-5 py-2 text-sm font-semibold transition-all duration-200"
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="rounded-full bg-[#27c462] hover:bg-[#20b255] text-white px-5 py-2 text-sm font-semibold shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/35 transition-all duration-200"
                >
                  Register
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 text-gray-700 dark:text-gray-200 hover:text-[#27c462] focus:outline-none"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-b border-gray-100 dark:border-white/10 bg-white dark:bg-[#0c1418] px-4 pt-3 pb-6 space-y-3 shadow-xl">
            <button
              onClick={() => scrollToSection('features')}
              className="block w-full text-left py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-[#27c462]"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('solutions')}
              className="block w-full text-left py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-[#27c462]"
            >
              Solutions
            </button>
            <button
              onClick={() => scrollToSection('flow-builder')}
              className="block w-full text-left py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-[#27c462]"
            >
              Flow Builder
            </button>
            <button
              onClick={() => scrollToSection('pricing')}
              className="block w-full text-left py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-[#27c462]"
            >
              Pricing
            </button>
            <button
              onClick={() => scrollToSection('faq')}
              className="block w-full text-left py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-[#27c462]"
            >
              FAQ
            </button>
            <div className="pt-2 border-t border-gray-100 dark:border-white/10 grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => openPageModal('terms')}
                className="text-left py-1 text-gray-500 hover:text-[#27c462]"
              >
                Terms of Service
              </button>
              <button
                onClick={() => openPageModal('privacy')}
                className="text-left py-1 text-gray-500 hover:text-[#27c462]"
              >
                Privacy Policy
              </button>
              <button
                onClick={() => openPageModal('shipping')}
                className="text-left py-1 text-gray-500 hover:text-[#27c462]"
              >
                Shipping Policy
              </button>
              <button
                onClick={() => openPageModal('refund')}
                className="text-left py-1 text-gray-500 hover:text-[#27c462]"
              >
                Refund Policy
              </button>
              <button
                onClick={() => openPageModal('about')}
                className="text-left py-1 text-gray-500 hover:text-[#27c462]"
              >
                About Us
              </button>
              <button
                onClick={() => openPageModal('contact')}
                className="text-left py-1 text-gray-500 hover:text-[#27c462]"
              >
                Contact Us
              </button>
            </div>
            <div className="pt-3 border-t border-gray-100 dark:border-white/10 flex flex-col gap-2">
              {signedInUser ? (
                <Button
                  onClick={() => navigate('/dashboard')}
                  className="w-full bg-[#27c462] hover:bg-[#20b255] text-white rounded-full py-2.5 text-sm"
                >
                  Open Dashboard
                </Button>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="text-center w-full rounded-full border border-[#27c462] text-[#27c462] py-2 text-sm font-semibold"
                  >
                    Login
                  </Link>
                  <Link
                    to="/signup"
                    className="text-center w-full rounded-full bg-[#27c462] text-white py-2 text-sm font-semibold shadow-md"
                  >
                    Register
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* HERO / MASTHEAD SECTION */}
      <section className="relative overflow-hidden pt-8 pb-16 lg:pt-16 lg:pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Masthead Graphic / Illustration (Left Column) */}
            <div className="lg:col-span-6 order-2 lg:order-1 flex justify-center relative">
              <div className="relative w-full max-w-lg">
                {/* Floating ambient glow */}
                <div className="absolute -inset-4 bg-gradient-to-tr from-[#27c462]/20 to-emerald-400/10 rounded-3xl blur-2xl -z-10 transform -rotate-2" />
                <img
                  src="/landing/masthead.png"
                  alt="WhatsApp Marketing Platform"
                  className="w-full h-auto object-contain drop-shadow-2xl rounded-2xl transition-transform duration-500 hover:scale-[1.02]"
                />
              </div>
            </div>

            {/* Headline and CTAs (Right Column) */}
            <div className="lg:col-span-6 order-1 lg:order-2 space-y-6 text-center lg:text-left">
              {/* Pill badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5" />
                Official WhatsApp Cloud API Platform
              </div>

              {/* Main Headline */}
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 dark:text-white leading-[1.18] tracking-tight font-ubuntu">
                Engage Your Customers on WhatsApp Like Never Before{' '}
                <span className="relative inline-block text-[#27c462]">
                  {platformName}
                  <span
                    aria-hidden
                    className="absolute -bottom-1.5 left-0 w-full h-2.5 bg-[#f4cf34]/70 -rotate-1 rounded-full -z-10"
                  />
                </span>
              </h1>

              {/* Subheading */}
              <p className="text-base sm:text-lg text-gray-600 dark:text-gray-300 max-w-xl mx-auto lg:mx-0 leading-relaxed font-poppins">
                Unlock the full potential of customer engagement with {platformName} — your comprehensive WhatsApp Marketing Platform. Connect in real-time, automate 24/7 replies, schedule broadcasts, and turn conversations into high-converting revenue.
              </p>

              {/* CTA Buttons */}
              <div className="pt-2 flex flex-wrap items-center justify-center lg:justify-start gap-4">
                <Link
                  to="/login"
                  className="rounded-full bg-[#27c462] hover:bg-[#20b255] text-white px-8 py-3.5 text-sm sm:text-base font-bold shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 transition-all duration-200"
                >
                  Get Started
                </Link>
                <Link
                  to="/signup"
                  className="rounded-full border-2 border-[#27c462] text-[#27c462] hover:bg-[#27c462] hover:text-white px-8 py-3.5 text-sm sm:text-base font-bold transition-all duration-200"
                >
                  Signup Now
                </Link>
              </div>

              {/* Quick Trust Badges */}
              <div className="pt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-gray-100 dark:border-white/10 text-xs text-gray-500 dark:text-gray-400 font-medium">
                <div className="flex items-center gap-1.5 justify-center lg:justify-start">
                  <CheckCircle2 className="h-4 w-4 text-[#27c462] shrink-0" />
                  <span>Meta Verified</span>
                </div>
                <div className="flex items-center gap-1.5 justify-center lg:justify-start">
                  <CheckCircle2 className="h-4 w-4 text-[#27c462] shrink-0" />
                  <span>98% Open Rate</span>
                </div>
                <div className="flex items-center gap-1.5 justify-center lg:justify-start">
                  <CheckCircle2 className="h-4 w-4 text-[#27c462] shrink-0" />
                  <span>24/7 Bot Replies</span>
                </div>
                <div className="flex items-center gap-1.5 justify-center lg:justify-start">
                  <CheckCircle2 className="h-4 w-4 text-[#27c462] shrink-0" />
                  <span>Zero Server Setup</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY CHOOSE ONE SUIT SECTION */}
      <section className="py-20 bg-gray-50/80 dark:bg-[#0c1419]/70 border-y border-gray-100 dark:border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white font-ubuntu">
              Why Choose <span className="text-[#27c462]">{platformName}?</span>
            </h2>
            <p className="mt-3 text-base sm:text-lg text-gray-600 dark:text-gray-400 font-poppins">
              Built from the ground up to give businesses the highest ROI from their WhatsApp marketing channels.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="group rounded-2xl bg-white dark:bg-[#111b21] p-8 text-center border border-gray-100 dark:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-[#27c462] flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                <Award className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 font-ubuntu">
                Increased Engagement
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-poppins">
                Connect directly with your customers in real-time on WhatsApp using {platformName}'s intuitive interface and seamless integration. Build lasting relationships that drive measurable results.
              </p>
            </div>

            {/* Card 2 */}
            <div className="group rounded-2xl bg-white dark:bg-[#111b21] p-8 text-center border border-gray-100 dark:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-[#27c462] flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                <TrendingUp className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 font-ubuntu">
                Higher Conversion Rates
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-poppins">
                With {platformName} every chat is an opportunity. Transform casual chats into meaningful interactions that lead to increased conversions through targeted messaging and personalized campaigns.
              </p>
            </div>

            {/* Card 3 */}
            <div className="group rounded-2xl bg-white dark:bg-[#111b21] p-8 text-center border border-gray-100 dark:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-[#27c462] flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                <Headphones className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 font-ubuntu">
                24/7 Customer Support
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-poppins">
                Your customers deserve the best support, and {platformName} delivers with 24/7 automated responses that ensure you never miss a beat. Stay connected, stay responsive, and watch your business thrive.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* TECH EMPOWERMENT / FEATURES GRID SECTION */}
      <section id="features" className="py-24 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-[#27c462] font-semibold text-sm uppercase tracking-wider font-poppins">
              Features
            </span>
            <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white font-ubuntu">
              Tech Empowerment
            </h2>
            <p className="mt-3 text-base sm:text-lg text-gray-600 dark:text-gray-400 font-poppins">
              Features that would make your life easier with WhatsApp Marketing
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* 1. Embedded Signup */}
            <div className="group rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111b21] p-7 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300">
              <div className="w-13 h-13 rounded-2xl bg-[#f4f6f8] dark:bg-white/5 text-[#27c462] flex items-center justify-center mb-5 group-hover:bg-[#27c462] group-hover:text-white transition-colors">
                <LogIn className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 font-ubuntu">
                Embedded Signup
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-poppins">
                Onboard customers and link WhatsApp phone numbers with ease via our integrated Meta Embedded Signup flow.
              </p>
            </div>

            {/* 2. Template Management */}
            <div className="group rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111b21] p-7 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300">
              <div className="w-13 h-13 rounded-2xl bg-[#f4f6f8] dark:bg-white/5 text-[#27c462] flex items-center justify-center mb-5 group-hover:bg-[#27c462] group-hover:text-white transition-colors">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 font-ubuntu">
                Template Management
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-poppins">
                Create, customize, and submit message templates directly within the application without visiting Meta Business Manager.
              </p>
            </div>

            {/* 3. Multiple Phone Numbers */}
            <div className="group rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111b21] p-7 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300">
              <div className="w-13 h-13 rounded-2xl bg-[#f4f6f8] dark:bg-white/5 text-[#27c462] flex items-center justify-center mb-5 group-hover:bg-[#27c462] group-hover:text-white transition-colors">
                <Phone className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 font-ubuntu">
                Multiple Phone Numbers
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-poppins">
                Connect and manage multiple phone numbers under the same WhatsApp Business Account with isolated inbox routing.
              </p>
            </div>

            {/* 4. WhatsApp Chat */}
            <div className="group rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111b21] p-7 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300">
              <div className="w-13 h-13 rounded-2xl bg-[#f4f6f8] dark:bg-white/5 text-[#27c462] flex items-center justify-center mb-5 group-hover:bg-[#27c462] group-hover:text-white transition-colors">
                <MessageSquare className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 font-ubuntu">
                WhatsApp Chat
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-poppins">
                {platformName}'s live chat replicates the native WhatsApp Web interface, guaranteeing a familiar and friction-free user experience.
              </p>
            </div>

            {/* 5. Bot Replies / Chatbot */}
            <div className="group rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111b21] p-7 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300">
              <div className="w-13 h-13 rounded-2xl bg-[#f4f6f8] dark:bg-white/5 text-[#27c462] flex items-center justify-center mb-5 group-hover:bg-[#27c462] group-hover:text-white transition-colors">
                <Bot className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 font-ubuntu">
                Bot Replies / Chat Bot
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-poppins">
                Automate responses and engage customers 24/7 with intelligent keyword matching, smart fallbacks, and multi-step dialogs.
              </p>
            </div>

            {/* 6. APIs to Connect with Other Services */}
            <div className="group rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111b21] p-7 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300">
              <div className="w-13 h-13 rounded-2xl bg-[#f4f6f8] dark:bg-white/5 text-[#27c462] flex items-center justify-center mb-5 group-hover:bg-[#27c462] group-hover:text-white transition-colors">
                <Sliders className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 font-ubuntu">
                APIs to Connect Services
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-poppins">
                Full REST APIs and real-time webhooks enable seamless connection with CRM, ERP, Shopify, WooCommerce, and custom tools.
              </p>
            </div>

            {/* 7. Manage Contacts */}
            <div className="group rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111b21] p-7 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300">
              <div className="w-13 h-13 rounded-2xl bg-[#f4f6f8] dark:bg-white/5 text-[#27c462] flex items-center justify-center mb-5 group-hover:bg-[#27c462] group-hover:text-white transition-colors">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 font-ubuntu">
                Manage Contacts
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-poppins">
                Effortlessly import and export contacts using XLSX/CSV formats with dynamic custom field mapping and segment tagging.
              </p>
            </div>

            {/* 8. Realtime Updates */}
            <div className="group rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111b21] p-7 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300">
              <div className="w-13 h-13 rounded-2xl bg-[#f4f6f8] dark:bg-white/5 text-[#27c462] flex items-center justify-center mb-5 group-hover:bg-[#27c462] group-hover:text-white transition-colors">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 font-ubuntu">
                Realtime Updates
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-poppins">
                Instant delivery receipts, read ticks, inbound alerts, and campaign tracking so you stay on top of messaging performance.
              </p>
            </div>

            {/* 9. Interactive Button Messages */}
            <div className="group rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111b21] p-7 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300">
              <div className="w-13 h-13 rounded-2xl bg-[#f4f6f8] dark:bg-white/5 text-[#27c462] flex items-center justify-center mb-5 group-hover:bg-[#27c462] group-hover:text-white transition-colors">
                <Workflow className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 font-ubuntu">
                Interactive Buttons & Lists
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-poppins">
                Build smarter bots with rich interactive reply buttons, list pickers, media headers, and catalog item displays.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* DETAILED FEATURE SPOTLIGHTS SECTION */}
      <section id="solutions" className="py-16 space-y-24">
        {/* Spotlight 1: Campaign Management */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 flex justify-center">
              <div className="relative w-full max-w-lg">
                <div className="absolute -inset-4 bg-emerald-500/10 rounded-3xl blur-2xl -z-10" />
                <img
                  src="/landing/campaign.png"
                  alt="Campaign Management"
                  className="w-full h-auto object-contain rounded-2xl shadow-xl border border-gray-100 dark:border-white/10"
                />
              </div>
            </div>
            <div className="lg:col-span-6 space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#e2424d] font-poppins">
                Streamline Campaign Management: Create, Schedule, and Reach Instantly!
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white font-ubuntu">
                Campaign Management
              </h2>
              <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed font-poppins">
                Effortlessly manage your campaigns with our intuitive campaign management feature. Create or schedule campaigns instantly for all contacts or specific groups, allowing for immediate reach or strategic timing. Maximize the impact of your marketing efforts and take control of your messaging with ease.
              </p>
              <ul className="space-y-2 pt-2 text-sm text-gray-700 dark:text-gray-300">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#27c462] shrink-0" />
                  <span>Dynamic contact variable tags: Hi {'{{1}}'}, your balance is {'{{2}}'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#27c462] shrink-0" />
                  <span>Batch scheduling with smart rate limits to prevent spam flagging</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#27c462] shrink-0" />
                  <span>Comprehensive delivery, read, and conversion analytics in real time</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Spotlight 2: Integrated WhatsApp Chat */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 order-2 lg:order-1 space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#e2424d] font-poppins">
                Enhance Customer Engagement and Support
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white font-ubuntu">
                Integrated WhatsApp Chat
              </h2>
              <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed font-poppins">
                The Integrated WhatsApp Chat feature in {platformName} provides a seamless and familiar messaging experience by faithfully replicating the native WhatsApp interface. Users can navigate effortlessly, leveraging their existing familiarity with WhatsApp's layout and functions. This consistency enhances user comfort and efficiency, facilitating smooth communication.
              </p>
              <ul className="space-y-2 pt-2 text-sm text-gray-700 dark:text-gray-300">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#27c462] shrink-0" />
                  <span>Multi-agent shared team inbox with live agent transfer</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#27c462] shrink-0" />
                  <span>Canned quick replies for instant answers to frequently asked questions</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#27c462] shrink-0" />
                  <span>Voice notes, document attachments, and product catalogue cards</span>
                </li>
              </ul>
            </div>
            <div className="lg:col-span-6 order-1 lg:order-2 flex justify-center">
              <div className="relative w-full max-w-lg">
                <div className="absolute -inset-4 bg-emerald-500/10 rounded-3xl blur-2xl -z-10" />
                <img
                  src="/landing/whatsapp-chat.png"
                  alt="Integrated WhatsApp Chat"
                  className="w-full h-auto object-contain rounded-2xl shadow-xl border border-gray-100 dark:border-white/10"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Spotlight 3: Bot Flow Builder */}
        <div id="flow-builder" className="py-16 bg-gray-50/80 dark:bg-[#0c1419]/70 border-y border-gray-100 dark:border-white/[0.04]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              <div className="lg:col-span-6 flex flex-col items-center">
                {/* 3 Interactive Flow Cards */}
                <div className="relative w-full max-w-md h-[460px] flex items-center justify-center">
                  {[
                    { img: '/landing/bot-flow1.png', label: 'Flow Canvas 1' },
                    { img: '/landing/bot-flow2.png', label: 'Flow Canvas 2' },
                    { img: '/landing/bot-flow3.png', label: 'Flow Canvas 3' },
                  ].map((flow, index) => {
                    const isSelected = activeFlowIndex === index;
                    return (
                      <div
                        key={flow.img}
                        onClick={() => setActiveFlowIndex(index)}
                        className={cn(
                          'absolute inset-0 cursor-pointer rounded-2xl overflow-hidden border-2 transition-all duration-500 shadow-2xl bg-white dark:bg-[#111b21]',
                          isSelected
                            ? 'z-30 scale-100 opacity-100 border-[#27c462]'
                            : index === (activeFlowIndex + 1) % 3
                            ? 'z-20 scale-95 translate-x-6 -translate-y-4 opacity-70 border-gray-200 dark:border-white/10'
                            : 'z-10 scale-90 -translate-x-6 translate-y-4 opacity-50 border-gray-200 dark:border-white/10'
                        )}
                      >
                        <img
                          src={flow.img}
                          alt={flow.label}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    );
                  })}
                </div>
                {/* Interactive Dots Switcher */}
                <div className="flex items-center gap-2 mt-6">
                  {[0, 1, 2].map((idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveFlowIndex(idx)}
                      className={cn(
                        'h-2.5 rounded-full transition-all duration-300',
                        activeFlowIndex === idx ? 'w-8 bg-[#27c462]' : 'w-2.5 bg-gray-300 dark:bg-white/20'
                      )}
                      aria-label={`View Bot Flow preview ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>

              <div className="lg:col-span-6 space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-[#e2424d] font-poppins">
                  Simplify Bot Flow Conversion Building
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white font-ubuntu">
                  Bot Flow Builder
                </h2>
                <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed font-poppins">
                  Our Advance Bot Flow builder helps you to build bot conversions easily and effectively. Bot flow builder simplifies setting triggering points from one bot to other using links for the buttons and list row options.
                </p>
                <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-700 dark:text-gray-300 font-poppins">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#27c462]" />
                    <span>Visual Node-Based Canvas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#27c462]" />
                    <span>Conditional Logic & Branching</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#27c462]" />
                    <span>Interactive Quick Buttons</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#27c462]" />
                    <span>Webhook & API Actions</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Spotlight 4: Reached to the Customers (Rich Media Messages) - Emerald Card Banner */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-br from-[#0f5c62] to-[#147a6b] p-8 sm:p-12 lg:p-16 text-white shadow-2xl relative overflow-hidden">
            <div
              aria-hidden
              className="absolute -right-20 -bottom-20 w-96 h-96 bg-white/5 rounded-full blur-3xl pointer-events-none"
            />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              <div className="lg:col-span-6 space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-[#ffd600] font-poppins">
                  Do you want to make your chat bot interactions more exciting and engaging?
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-white font-ubuntu">
                  Reached to the Customers
                </h2>
                <p className="text-base text-emerald-100 leading-relaxed font-poppins">
                  Our Advance bot feature allows you to send images, videos, and documents as well as buttons through your chat bot. Instead of only using text, you can now impress your customers with visually pleasing images, informative videos, and useful documents. It's a great way to capture their attention and provide them with valuable content.
                </p>
                <div className="pt-2">
                  <Link
                    to="/signup"
                    className="inline-flex items-center gap-2 rounded-full bg-white text-[#0f5c62] hover:bg-emerald-50 px-6 py-3 text-sm font-bold shadow-lg transition-all"
                  >
                    <span>Try Media Messages Now</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
              <div className="lg:col-span-6 flex justify-center">
                <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border-4 border-white/20">
                  <img
                    src="/landing/media-message.png"
                    alt="Rich Media Messages"
                    className="w-full h-auto object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Spotlight 5: QR Code Generation - Emerald Card Banner */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-br from-[#0b4a4f] to-[#0f5c62] p-8 sm:p-12 lg:p-16 text-white shadow-2xl relative overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              <div className="lg:col-span-6 order-2 lg:order-1 flex justify-center">
                <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl p-4 bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center">
                  <img
                    src="/landing/qr-code.png"
                    alt="QR Code Generation"
                    className="w-full h-auto object-contain rounded-xl"
                  />
                </div>
              </div>
              <div className="lg:col-span-6 order-1 lg:order-2 space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-[#ffd600] font-poppins">
                  Scan QR Code to Start Chat
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-white font-ubuntu">
                  QR Code Generation
                </h2>
                <p className="text-base text-emerald-100 leading-relaxed font-poppins">
                  Quickly generate QR codes for your WhatsApp phone number with ease using this feature. Users can effortlessly connect by scanning the code with their smartphones, instantly initiating communication with your WhatsApp account. This streamlined process ensures smooth interactions and easy access for engaging with your audience.
                </p>
                <div className="pt-2">
                  <Link
                    to="/signup"
                    className="inline-flex items-center gap-2 rounded-full bg-[#27c462] hover:bg-[#20b255] text-white px-6 py-3 text-sm font-bold shadow-lg transition-all"
                  >
                    <span>Generate Your QR Code</span>
                    <QrCode className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Spotlight 6: AI Bots Integration with FlowiseAI & WhatsApp Cloud API */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#27c462] font-poppins">
                Intelligent Generative Workflows
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white font-ubuntu">
                AI Bots Integration for Vendors using{' '}
                <span className="text-emerald-600 dark:text-[#27c462]">FlowiseAI</span>
              </h2>
              <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed font-poppins">
                Flowise AI offers AI-powered chatbots for vendors to automate customer interactions and enhance engagement. Powered seamlessly by the official Meta WhatsApp Cloud API without requiring dedicated server management.
              </p>
              <div className="p-4 rounded-xl border border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-[#111b21] space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                  <Sparkles className="h-4 w-4 text-[#27c462]" />
                  <span>Powered by WhatsApp Cloud API</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {platformName} seamlessly integrates with the WhatsApp Cloud API, ensuring smooth operations without server management or additional expenses, making it a cost-effective solution.
                </p>
              </div>
            </div>
            <div className="lg:col-span-6 flex justify-center">
              <div className="relative w-full max-w-lg">
                <img
                  src="/landing/bg-11.png"
                  alt="AI Bots Integration"
                  className="w-full h-auto object-contain rounded-2xl shadow-xl"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING SECTION */}
      <section id="pricing" className="py-24 bg-gray-50/80 dark:bg-[#0c1419]/70 border-y border-gray-100 dark:border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white font-ubuntu">
              Simple and Clear Pricing
            </h2>
            <p className="mt-3 text-base sm:text-lg text-gray-600 dark:text-gray-400 font-poppins">
              Start free, scale as your business expands. No hidden platform markups.
            </p>

            {/* Billing Switcher Toggle */}
            <div className="mt-8 inline-flex items-center gap-3 p-1 rounded-full bg-white dark:bg-[#111b21] border border-gray-200 dark:border-white/10 shadow-sm">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={cn(
                  'px-5 py-2 text-xs sm:text-sm font-semibold rounded-full transition-all cursor-pointer',
                  billingCycle === 'monthly'
                    ? 'bg-[#27c462] text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                )}
              >
                Monthly Billing
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={cn(
                  'px-5 py-2 text-xs sm:text-sm font-semibold rounded-full transition-all flex items-center gap-1.5 cursor-pointer',
                  billingCycle === 'yearly'
                    ? 'bg-[#27c462] text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                )}
              >
                <span>Yearly Billing</span>
                <span className="text-[10px] uppercase font-bold bg-[#ffd600] text-gray-900 px-1.5 py-0.5 rounded-full">
                  Save 17%
                </span>
              </button>
            </div>
          </div>

          {/* Pricing Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {/* Free Plan */}
            <div className="rounded-3xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#111b21] p-8 flex flex-col justify-between shadow-sm hover:shadow-xl transition-all duration-300">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white font-ubuntu">
                  Free
                </h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-gray-900 dark:text-white font-ubuntu">
                    ₹0.00
                  </span>
                  <span className="text-xs text-gray-500">INR</span>
                </div>
                <div className="mt-1">
                  <a
                    href="https://business.whatsapp.com/products/platform-pricing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gray-500 hover:text-[#27c462] inline-flex items-center gap-1"
                  >
                    + WhatsApp Cloud Messaging Charges <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="my-6 border-t border-gray-100 dark:border-white/10" />

                <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300 font-poppins">
                  <li className="flex items-center justify-between">
                    <span>Contacts</span>
                    <strong className="text-gray-900 dark:text-white">50</strong>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Campaigns</span>
                    <strong className="text-gray-900 dark:text-white">1 Per Month</strong>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Bot Replies</span>
                    <strong className="text-gray-900 dark:text-white">0</strong>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Bot Flows</span>
                    <strong className="text-gray-900 dark:text-white">0</strong>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Contact Custom Fields</span>
                    <strong className="text-gray-900 dark:text-white">1</strong>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Team Members / Agents</span>
                    <strong className="text-gray-900 dark:text-white">0</strong>
                  </li>
                  <li className="flex items-center justify-between text-gray-400">
                    <span>AI Chat Bot</span>
                    <XCircle className="h-4 w-4 text-red-500" />
                  </li>
                  <li className="flex items-center justify-between text-gray-400">
                    <span>API and Webhook Access</span>
                    <XCircle className="h-4 w-4 text-red-500" />
                  </li>
                </ul>
              </div>

              <div className="pt-8">
                <Link
                  to="/signup"
                  className="block w-full text-center rounded-full border border-gray-300 dark:border-white/20 text-gray-700 dark:text-gray-200 hover:border-[#27c462] hover:text-[#27c462] py-3 text-sm font-bold transition-all"
                >
                  Get Started Free
                </Link>
              </div>
            </div>

            {/* Basic Plan (Featured) */}
            <div className="relative rounded-3xl border-2 border-[#27c462] bg-white dark:bg-[#111b21] p-8 flex flex-col justify-between shadow-xl shadow-emerald-500/10 scale-100 md:scale-105 z-10">
              <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#27c462] text-white px-4 py-1 text-xs font-bold uppercase tracking-wider shadow-sm">
                Most Popular
              </span>

              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white font-ubuntu">
                  Basic Plan
                </h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-[#e2424d] font-ubuntu">
                    {billingCycle === 'monthly' ? '₹999.00' : '₹9,999.00'}
                  </span>
                  <span className="text-xs text-gray-500">
                    INR / {billingCycle === 'monthly' ? 'month' : 'year'}
                  </span>
                </div>
                <div className="mt-1">
                  <a
                    href="https://business.whatsapp.com/products/platform-pricing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gray-500 hover:text-[#27c462] inline-flex items-center gap-1"
                  >
                    + WhatsApp Cloud Messaging Charges <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="my-6 border-t border-gray-100 dark:border-white/10" />

                <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300 font-poppins">
                  <li className="flex items-center justify-between">
                    <span>Contacts</span>
                    <strong className="text-gray-900 dark:text-white">5,000</strong>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Campaigns</span>
                    <strong className="text-gray-900 dark:text-white">5 Per Month</strong>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Bot Replies</span>
                    <strong className="text-gray-900 dark:text-white">5</strong>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Bot Flows</span>
                    <strong className="text-gray-900 dark:text-white">2</strong>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Contact Custom Fields</span>
                    <strong className="text-gray-900 dark:text-white">5</strong>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Team Members / Agents</span>
                    <strong className="text-gray-900 dark:text-white">0</strong>
                  </li>
                  <li className="flex items-center justify-between text-gray-400">
                    <span>AI Chat Bot</span>
                    <XCircle className="h-4 w-4 text-red-500" />
                  </li>
                  <li className="flex items-center justify-between text-gray-400">
                    <span>API and Webhook Access</span>
                    <XCircle className="h-4 w-4 text-red-500" />
                  </li>
                </ul>
              </div>

              <div className="pt-8">
                <Link
                  to="/signup?plan=basic"
                  className="block w-full text-center rounded-full bg-[#27c462] hover:bg-[#20b255] text-white py-3 text-sm font-bold shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all"
                >
                  Choose Basic Plan
                </Link>
              </div>
            </div>

            {/* Advance Plan */}
            <div className="rounded-3xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#111b21] p-8 flex flex-col justify-between shadow-sm hover:shadow-xl transition-all duration-300">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white font-ubuntu">
                  Advance Plan
                </h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-[#e2424d] font-ubuntu">
                    {billingCycle === 'monthly' ? '₹2,499.00' : '₹24,999.00'}
                  </span>
                  <span className="text-xs text-gray-500">
                    INR / {billingCycle === 'monthly' ? 'month' : 'year'}
                  </span>
                </div>
                <div className="mt-1">
                  <a
                    href="https://business.whatsapp.com/products/platform-pricing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gray-500 hover:text-[#27c462] inline-flex items-center gap-1"
                  >
                    + WhatsApp Cloud Messaging Charges <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="my-6 border-t border-gray-100 dark:border-white/10" />

                <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300 font-poppins">
                  <li className="flex items-center justify-between">
                    <span>Contacts</span>
                    <strong className="text-[#27c462]">Unlimited</strong>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Campaigns</span>
                    <strong className="text-[#27c462]">Unlimited / Month</strong>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Bot Replies</span>
                    <strong className="text-[#27c462]">Unlimited</strong>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Bot Flows</span>
                    <strong className="text-[#27c462]">Unlimited</strong>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Contact Custom Fields</span>
                    <strong className="text-[#27c462]">Unlimited</strong>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Team Members / Agents</span>
                    <strong className="text-[#27c462]">Unlimited</strong>
                  </li>
                  <li className="flex items-center justify-between text-gray-700 dark:text-gray-200">
                    <span>AI Chat Bot</span>
                    <CheckCircle2 className="h-4 w-4 text-[#27c462]" />
                  </li>
                  <li className="flex items-center justify-between text-gray-700 dark:text-gray-200">
                    <span>API and Webhook Access</span>
                    <CheckCircle2 className="h-4 w-4 text-[#27c462]" />
                  </li>
                </ul>
              </div>

              <div className="pt-8">
                <Link
                  to="/signup?plan=advance"
                  className="block w-full text-center rounded-full bg-[#0f5c62] hover:bg-[#0b4a4f] text-white py-3 text-sm font-bold shadow-md transition-all"
                >
                  Choose Advance Plan
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FREQUENTLY ASKED QUESTIONS SECTION */}
      <section id="faq" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-5 space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#27c462] font-poppins">
                Help & Support
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white font-ubuntu">
                Frequently Asked Questions
              </h2>
              <p className="text-base text-gray-600 dark:text-gray-300 font-poppins leading-relaxed">
                Have questions? Here you'll find the answers most valued by our partners, along with access to step-by-step instructions and support.
              </p>
              <div className="pt-4">
                <button
                  onClick={() => openPageModal('contact')}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-300 dark:border-white/20 text-gray-700 dark:text-gray-300 hover:border-[#27c462] hover:text-[#27c462] px-5 py-2.5 text-xs font-semibold transition-all cursor-pointer"
                >
                  <span>Need custom assistance? Contact us</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="lg:col-span-7 space-y-4">
              {[
                {
                  q: 'How do I sign up for One Suit?',
                  a: `Signing up for ${platformName} is easy and straightforward. Just visit our sign-up page, fill in your details, and follow the instructions to connect your WhatsApp Business account through Meta's Embedded Signup.`,
                },
                {
                  q: 'Can I import contacts from an existing customer database?',
                  a: 'Yes, One Suit supports importing contacts through XLSX and CSV spreadsheets. You can easily upload your existing customer database, map custom variables, and start sending broadcast campaigns right away.',
                },
                {
                  q: 'What kind of support does One Suit offer?',
                  a: 'One Suit offers 24/7 customer support through live chat, email, and phone. Our dedicated onboarding team is here to help you with any issues, API setup, or bot design questions you might have.',
                },
                {
                  q: 'Do I need dedicated servers to run WhatsApp chatbots?',
                  a: 'No! One Suit operates entirely on cloud infrastructure and connects directly with the official Meta WhatsApp Cloud API. You do not need to host or maintain any servers.',
                },
                {
                  q: 'Can multiple agents manage the same WhatsApp number?',
                  a: 'Yes, One Suit includes a collaborative multi-agent inbox. You can invite team members with specific roles, assign incoming chats, transfer conversations, and use private internal notes.',
                },
              ].map((faq, index) => {
                const isOpen = activeFaq === index;
                return (
                  <div
                    key={faq.q}
                    className="rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111b21] overflow-hidden transition-all duration-200"
                  >
                    <button
                      onClick={() => setActiveFaq(isOpen ? null : index)}
                      className="w-full flex items-center justify-between p-5 text-left text-base font-bold text-gray-900 dark:text-white font-poppins focus:outline-none cursor-pointer"
                    >
                      <span>{faq.q}</span>
                      <ChevronDown
                        className={cn(
                          'h-5 w-5 text-gray-400 transition-transform duration-200 shrink-0',
                          isOpen && 'rotate-180 text-[#27c462]'
                        )}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-poppins border-t border-gray-50 dark:border-white/5 pt-3">
                        {faq.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-gray-100 dark:border-white/10 bg-white dark:bg-[#080d11]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
            {/* Logo & Tagline */}
            <div className="md:col-span-5 space-y-4">
              <Link to="/" className="flex items-center gap-3">
                {customLogoUrl ? (
                  <img src={customLogoUrl} alt={platformName} className="h-10 w-auto" />
                ) : (
                  <div className="flex items-center gap-2">
                    <img
                      src="/landing/onesuit-logo.png"
                      alt={platformName}
                      className="h-10 w-auto"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white font-ubuntu">
                      {platformName}
                    </span>
                  </div>
                )}
              </Link>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm font-poppins">
                One Suit of all your Business Need. The modern conversational marketing platform for WhatsApp Business Cloud API.
              </p>
              <div className="pt-2 flex items-center gap-3 text-gray-400">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Follow us:
                </span>
                <a
                  href="https://facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/5 hover:bg-[#27c462] hover:text-white flex items-center justify-center transition-colors text-xs"
                >
                  FB
                </a>
                <a
                  href="https://twitter.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/5 hover:bg-[#27c462] hover:text-white flex items-center justify-center transition-colors text-xs"
                >
                  X
                </a>
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/5 hover:bg-[#27c462] hover:text-white flex items-center justify-center transition-colors text-xs"
                >
                  IN
                </a>
              </div>
            </div>

            {/* Useful Links */}
            <div className="md:col-span-3 space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white font-ubuntu">
                Useful Links
              </h3>
              <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400 font-poppins">
                <li>
                  <button
                    onClick={() => scrollToSection('features')}
                    className="hover:text-[#27c462] transition-colors cursor-pointer"
                  >
                    Features
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection('solutions')}
                    className="hover:text-[#27c462] transition-colors cursor-pointer"
                  >
                    Solutions
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection('pricing')}
                    className="hover:text-[#27c462] transition-colors cursor-pointer"
                  >
                    Pricing
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => openPageModal('about')}
                    className="hover:text-[#27c462] transition-colors cursor-pointer"
                  >
                    About us
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => openPageModal('privacy')}
                    className="hover:text-[#27c462] transition-colors cursor-pointer"
                  >
                    Privacy policy
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => openPageModal('terms')}
                    className="hover:text-[#27c462] transition-colors cursor-pointer"
                  >
                    Terms and conditions
                  </button>
                </li>
              </ul>
            </div>

            {/* Contact Details */}
            <div className="md:col-span-4 space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white font-ubuntu">
                Contact
              </h3>
              <div className="space-y-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-poppins leading-relaxed">
                <p className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-[#27c462] shrink-0 mt-0.5" />
                  <span>
                    {branding.contact_address || 'Unit 15, Swapnshilp tower, Nashik 422101, Maharashtra, India'}
                  </span>
                </p>
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-[#27c462] shrink-0" />
                  <span>Call: {branding.support_phone || '+91 8505917890'}</span>
                </p>
                {branding.support_email && (
                  <p className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-[#27c462] shrink-0" />
                    <span>{branding.support_email}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Emerald Copyright Bar */}
        <div className="py-4 bg-[#27c462] text-white text-center text-xs font-medium font-poppins">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>© {platformName} 2026. All Rights Reserved.</div>
            <div className="flex items-center gap-4 text-xs">
              <button
                onClick={() => openPageModal('privacy')}
                className="hover:underline text-white cursor-pointer"
              >
                Privacy Policy
              </button>
              <span>•</span>
              <button
                onClick={() => openPageModal('terms')}
                className="hover:underline text-white cursor-pointer"
              >
                Terms of Service
              </button>
              <span>•</span>
              <button
                onClick={() => openPageModal('refund')}
                className="hover:underline text-white cursor-pointer"
              >
                Refund Policy
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* INTERACTIVE PAGE / POLICY MODAL DIALOG */}
      {modalDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#111b21] border border-gray-100 dark:border-white/10 p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 dark:border-white/10 pb-4">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white font-ubuntu">
                  {modalDetails.title}
                </h3>
                {modalDetails.subtitle && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {modalDetails.subtitle}
                  </p>
                )}
              </div>
              <button
                onClick={() => setActiveModalPage(null)}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="py-2">{modalDetails.content}</div>

            <div className="border-t border-gray-100 dark:border-white/10 pt-4 flex justify-end">
              <Button
                onClick={() => setActiveModalPage(null)}
                className="rounded-full bg-[#27c462] hover:bg-[#20b255] text-white px-6 py-2 text-sm cursor-pointer"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
