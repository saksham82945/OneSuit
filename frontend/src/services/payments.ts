import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { readData } from '@/services/response';
import { BILLING_CYCLES, type BillingInterval } from '@/services/superAdmin';

// Subscription payments: Razorpay Checkout and direct UPI (backend handlers/payments.go).

export type PaymentMethod = 'razorpay' | 'upi';
export type PaymentStatus = 'created' | 'pending_verification' | 'paid' | 'failed' | 'rejected';

export interface PaymentOptions {
  razorpay_enabled: boolean;
  razorpay_key_id: string;
  upi_enabled: boolean;
  upi_id: string;
  upi_payee_name: string;
}

export interface Payment {
  id: string;
  plan_id: string;
  plan_name: string;
  billing_cycle: BillingInterval;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  upi_reference?: string;
  failure_reason?: string;
  created_at: string;
  paid_at?: string | null;
  submitted_at?: string | null;
}

export interface RazorpayOrder {
  key_id: string;
  order_id: string;
  /** In paise. */
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name?: string; email?: string };
}

export interface UPIRequest {
  upi_id: string;
  payee_name: string;
  note: string;
  /** upi://pay?... link; opens any UPI app with the amount filled in. */
  uri: string;
}

export interface CheckoutResponse {
  payment_id: string;
  method: PaymentMethod;
  amount: number;
  currency: string;
  razorpay?: RazorpayOrder;
  upi?: UPIRequest;
}

export interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export const paymentsService = {
  options: async () => readData<PaymentOptions>(await api.get('/public/payment-options')),
  checkout: async (body: { plan_id: string; billing_cycle: BillingInterval; method: PaymentMethod }) =>
    readData<CheckoutResponse>(await api.post('/payments/checkout', body)),
  verifyRazorpay: async (id: string, body: RazorpaySuccess) =>
    readData<Payment>(await api.post(`/payments/${id}/razorpay/verify`, body)),
  submitUPI: async (id: string, body: { reference: string; phone?: string }) =>
    readData<Payment>(await api.post(`/payments/${id}/upi/submit`, body)),
  list: async () => readData<{ payments: Payment[] }>(await api.get('/payments'))?.payments ?? [],
  get: async (id: string) => readData<Payment>(await api.get(`/payments/${id}`)),
};

export const isBillingCycle = (c: string | null | undefined): c is BillingInterval => BILLING_CYCLES.some((b) => b.id === c);

/** True when Razorpay or UPI is switched on, so sign-up can offer "Pay now". */
export function useOnlinePaymentAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    paymentsService
      .options()
      .then((o) => !cancelled && setAvailable(!!(o?.razorpay_enabled || o?.upi_enabled)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return available;
}

/** The checkout page for a plan and billing cycle. */
export const checkoutPath = (planId?: string, cycle?: string) => {
  const q = new URLSearchParams();
  if (planId) q.set('plan', planId);
  if (cycle) q.set('cycle', cycle);
  const s = q.toString();
  return `/billing/checkout${s ? `?${s}` : ''}`;
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  created: 'Not paid',
  pending_verification: 'Awaiting verification',
  paid: 'Paid',
  failed: 'Failed',
  rejected: 'Rejected',
};

// --- Razorpay Checkout ---------------------------------------------------------

export interface RazorpayInstance {
  open: () => void;
  on: (event: string, cb: (resp: { error?: { description?: string } }) => void) => void;
}

type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;

const RAZORPAY_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let razorpayLoader: Promise<RazorpayCtor> | null = null;

/** Loads Razorpay's checkout.js once. */
export function loadRazorpay(): Promise<RazorpayCtor> {
  const existing = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
  if (existing) return Promise.resolve(existing);
  if (!razorpayLoader) {
    razorpayLoader = new Promise<RazorpayCtor>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = RAZORPAY_SRC;
      script.async = true;
      script.onload = () => {
        const ctor = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
        if (ctor) resolve(ctor);
        else reject(new Error('Razorpay did not load'));
      };
      script.onerror = () => reject(new Error('Razorpay did not load'));
      document.body.appendChild(script);
    }).catch((err) => {
      razorpayLoader = null;
      throw err;
    });
  }
  return razorpayLoader;
}
