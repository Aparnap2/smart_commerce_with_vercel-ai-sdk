/**
 * Stripe Client - Type-safe Stripe API wrapper with environment configuration
 *
 * Provides secure initialization and typed API methods for payment operations.
 */

import Stripe from 'stripe';

// ============================================================================
// Environment Configuration
// ============================================================================

interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
}

function getStripeConfig(): StripeConfig {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  if (!secretKey) {
    throw new Error(
      'STRIPE_SECRET_KEY is required. Please set it in your environment variables.'
    );
  }

  return {
    secretKey,
    webhookSecret,
  };
}

// ============================================================================
// Stripe Client Singleton
// ============================================================================

let stripeInstance: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (stripeInstance) {
    return stripeInstance;
  }

  const config = getStripeConfig();

  stripeInstance = new Stripe(config.secretKey, {
    apiVersion: '2025-04-30.basil' as Stripe.LatestApiVersion,
    typescript: true,
  });

  return stripeInstance;
}

export function getWebhookSecret(): string {
  const config = getStripeConfig();
  if (!config.webhookSecret) {
    throw new Error(
      'STRIPE_WEBHOOK_SECRET is required for webhook verification. ' +
        'Please set it in your environment variables.'
    );
  }
  return config.webhookSecret;
}

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Refund status enum for type safety
 */
export enum RefundStatus {
  PENDING = 'pending',
  REQUIRES_ACTION = 'requires_action',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

/**
 * Refund type representing Stripe refund response
 */
export interface RefundResult {
  id: string;
  amount: number;
  currency: string;
  paymentIntentId: string;
  chargeId: string;
  status: RefundStatus;
  reason: string | null;
  idempotencyKey: string;
  createdAt: Date;
  metadata: Record<string, string>;
}

/**
 * Charge info from payment intent
 */
export interface ChargeInfo {
  id: string;
  amount: number;
  refunded: boolean;
}

/**
 * Payment intent with refund information
 */
export interface PaymentIntentInfo {
  id: string;
  amount: number;
  amountReceived: number;
  currency: string;
  status: string;
  charges: {
    data: ChargeInfo[];
  };
}

/**
 * Create refund parameters
 */
export interface CreateRefundParams {
  paymentIntentId: string;
  amount?: number; // Amount in cents (optional for full refund)
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  idempotencyKey: string;
  metadata?: Record<string, string>;
}

// ============================================================================
// Type-Safe API Methods
// ============================================================================

/**
 * Retrieve a payment intent by ID
 */
export async function getPaymentIntent(
  paymentIntentId: string
): Promise<PaymentIntentInfo> {
  const stripe = getStripeClient();

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['charges'],
  });

  // Safely extract charges data (charges are expanded but TypeScript doesn't know this)
  const chargesData: ChargeInfo[] = [];
  const paymentIntentWithCharges = paymentIntent as Stripe.PaymentIntent & {
    charges?: {
      data: Array<{
        id: string;
        amount: number;
        refunded: boolean;
      }>;
    };
  };

  if (paymentIntentWithCharges.charges?.data) {
    chargesData.push(...paymentIntentWithCharges.charges.data.map(charge => ({
      id: charge.id,
      amount: charge.amount,
      refunded: charge.refunded,
    })));
  }

  return {
    id: paymentIntent.id,
    amount: paymentIntent.amount,
    amountReceived: paymentIntent.amount_received,
    currency: paymentIntent.currency,
    status: paymentIntent.status,
    charges: {
      data: chargesData,
    },
  };
}

/**
 * Create a refund with idempotency key
 */
export async function createRefund(
  params: CreateRefundParams
): Promise<RefundResult> {
  const stripe = getStripeClient();

  const refund = await stripe.refunds.create(
    {
      payment_intent: params.paymentIntentId,
      amount: params.amount, // Omit for full refund
      reason: params.reason || 'requested_by_customer',
      metadata: params.metadata,
    },
    {
      idempotencyKey: params.idempotencyKey,
    }
  );

  // Safely extract payment_intent and charge
  const paymentIntentId = typeof refund.payment_intent === 'string'
    ? refund.payment_intent
    : refund.payment_intent?.id || '';
  const chargeId = typeof refund.charge === 'string'
    ? refund.charge
    : refund.charge?.id || '';

  return {
    id: refund.id,
    amount: refund.amount,
    currency: refund.currency,
    paymentIntentId,
    chargeId,
    status: refund.status as RefundStatus,
    reason: refund.reason || null,
    idempotencyKey: params.idempotencyKey,
    createdAt: new Date(refund.created * 1000),
    metadata: refund.metadata as Record<string, string>,
  };
}

/**
 * Retrieve a refund by ID
 */
export async function getRefund(refundId: string): Promise<RefundResult> {
  const stripe = getStripeClient();

  const refund = await stripe.refunds.retrieve(refundId);

  // Safely extract payment_intent and charge
  const paymentIntentId = typeof refund.payment_intent === 'string'
    ? refund.payment_intent
    : refund.payment_intent?.id || '';
  const chargeId = typeof refund.charge === 'string'
    ? refund.charge
    : refund.charge?.id || '';

  return {
    id: refund.id,
    amount: refund.amount,
    currency: refund.currency,
    paymentIntentId,
    chargeId,
    status: refund.status as RefundStatus,
    reason: refund.reason || null,
    idempotencyKey: '',
    createdAt: new Date(refund.created * 1000),
    metadata: refund.metadata as Record<string, string>,
  };
}

/**
 * List refunds for a payment intent
 */
export async function listRefundsForPaymentIntent(
  paymentIntentId: string
): Promise<RefundResult[]> {
  const stripe = getStripeClient();

  const refunds = await stripe.refunds.list({
    payment_intent: paymentIntentId,
    limit: 100,
  });

  return refunds.data.map((refund) => {
    // Safely extract payment_intent and charge
    const piId = typeof refund.payment_intent === 'string'
      ? refund.payment_intent
      : refund.payment_intent?.id || '';
    const cId = typeof refund.charge === 'string'
      ? refund.charge
      : refund.charge?.id || '';

    return {
      id: refund.id,
      amount: refund.amount,
      currency: refund.currency,
      paymentIntentId: piId,
      chargeId: cId,
      status: refund.status as RefundStatus,
      reason: refund.reason || null,
      idempotencyKey: '',
      createdAt: new Date(refund.created * 1000),
      metadata: refund.metadata as Record<string, string>,
    };
  });
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const stripe = getStripeClient();
  const webhookSecret = getWebhookSecret();

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate refundable amount (total - already refunded)
 */
export function calculateRefundableAmount(
  paymentIntent: PaymentIntentInfo
): number {
  const totalCharged = paymentIntent.amountReceived;
  const alreadyRefunded = paymentIntent.charges.data.reduce(
    (sum, charge) => (charge.refunded ? sum + charge.amount : sum),
    0
  );
  return totalCharged - alreadyRefunded;
}

/**
 * Check if a payment intent is refundable
 */
export function isRefundable(paymentIntent: PaymentIntentInfo): boolean {
  const refundableStatuses = ['succeeded', 'requires_capture'];
  return (
    refundableStatuses.includes(paymentIntent.status) &&
    calculateRefundableAmount(paymentIntent) > 0
  );
}

/**
 * Format amount from cents to display format
 */
export function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}
