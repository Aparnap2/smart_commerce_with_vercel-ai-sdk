/**
 * Refund Service - Idempotent refund operations with typed exceptions
 *
 * Provides high-level refund operations with:
 * - Automatic idempotency key generation
 * - Comprehensive error handling
 * - Eligibility validation
 * - Partial and full refund support
 */

import {
  getStripeClient,
  getPaymentIntent,
  createRefund,
  getRefund,
  listRefundsForPaymentIntent,
  calculateRefundableAmount,
  isRefundable,
  formatAmount,
  RefundStatus,
  type RefundResult,
  type PaymentIntentInfo,
} from './client.js';

// Re-export for convenience
export type { RefundResult } from './client.js';

// ============================================================================
// Custom Exception Types
// ============================================================================

export class RefundException extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'RefundException';
  }
}

export class RefundEligibilityException extends RefundException {
  constructor(message: string, details?: unknown) {
    super(message, 'REFUND_ELIGIBILITY_ERROR', details);
    this.name = 'RefundEligibilityException';
  }
}

export class RefundValidationException extends RefundException {
  constructor(message: string, details?: unknown) {
    super(message, 'REFUND_VALIDATION_ERROR', details);
    this.name = 'RefundValidationException';
  }
}

export class RefundStateException extends RefundException {
  constructor(message: string, details?: unknown) {
    super(message, 'REFUND_STATE_ERROR', details);
    this.name = 'RefundStateException';
  }
}

export class RefundNotFoundException extends RefundException {
  constructor(refundId: string) {
    super(`Refund not found: ${refundId}`, 'REFUND_NOT_FOUND');
    this.name = 'RefundNotFoundException';
  }
}

// ============================================================================
// Refund Policy Configuration
// ============================================================================

export interface RefundPolicy {
  /** Maximum days after order date for refund eligibility */
  maxDaysAfterOrder: number;
  /** Minimum amount required for refund (in cents) */
  minRefundAmount: number;
  /** Maximum refundable percentage of original order */
  maxRefundPercentage: number;
  /** Eligible payment statuses */
  eligibleStatuses: string[];
  /** Allowed refund reasons */
  allowedReasons: Array<'duplicate' | 'fraudulent' | 'requested_by_customer'>;
}

export const DEFAULT_REFUND_POLICY: RefundPolicy = {
  maxDaysAfterOrder: 30,
  minRefundAmount: 100, // $1.00 minimum
  maxRefundPercentage: 100, // 100% = full refund allowed
  eligibleStatuses: ['succeeded', 'requires_capture'],
  allowedReasons: ['duplicate', 'fraudulent', 'requested_by_customer'],
};

// ============================================================================
// Refund Request/Response Types
// ============================================================================

export interface RefundRequest {
  orderId: string;
  paymentIntentId: string;
  customerEmail: string;
  amount?: number; // Amount in cents (optional for full refund)
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  orderDate: Date;
}

export interface RefundResponse {
  success: boolean;
  refund?: RefundResult;
  refundableAmount: number;
  requestedAmount: number;
  message: string;
}

export interface RefundEligibility {
  eligible: boolean;
  refundableAmount: number;
  orderDate: Date;
  daysSinceOrder: number;
  policy: RefundPolicy;
  violations: string[];
}

export interface RefundHistoryEntry {
  refund: RefundResult;
  orderId: string;
  customerEmail: string;
  createdAt: Date;
}

// ============================================================================
// Idempotency Key Generator
// ============================================================================

/**
 * Generate a unique idempotency key for refund operations
 * Format: ${order_id}-${timestamp}-${random_suffix}
 */
export function generateRefundIdempotencyKey(orderId: string): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `refund_${orderId}_${timestamp}_${randomSuffix}`;
}

// ============================================================================
// Refund Eligibility Validation
// ============================================================================

/**
 * Validate refund eligibility based on policy
 */
export function validateRefundEligibility(
  paymentIntent: PaymentIntentInfo,
  orderDate: Date,
  policy: RefundPolicy = DEFAULT_REFUND_POLICY
): RefundEligibility {
  const violations: string[] = [];
  const now = new Date();
  const daysSinceOrder = Math.floor(
    (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Check payment status
  if (!policy.eligibleStatuses.includes(paymentIntent.status)) {
    violations.push(
      `Payment status "${paymentIntent.status}" is not eligible for refund`
    );
  }

  // Check time window
  if (daysSinceOrder > policy.maxDaysAfterOrder) {
    violations.push(
      `Order is ${daysSinceOrder} days old (max: ${policy.maxDaysAfterOrder} days)`
    );
  }

  // Calculate refundable amount
  const refundableAmount = calculateRefundableAmount(paymentIntent);

  // Check minimum amount
  if (refundableAmount < policy.minRefundAmount) {
    violations.push(
      `Refundable amount ${formatAmount(refundableAmount, paymentIntent.currency)} is below minimum ${formatAmount(policy.minRefundAmount, paymentIntent.currency)}`
    );
  }

  return {
    eligible: violations.length === 0,
    refundableAmount,
    orderDate,
    daysSinceOrder,
    policy,
    violations,
  };
}

// ============================================================================
// Refund Amount Validation
// ============================================================================

/**
 * Validate requested refund amount against policy and available funds
 */
export function validateRefundAmount(
  requestedAmount: number | undefined,
  refundableAmount: number,
  policy: RefundPolicy = DEFAULT_REFUND_POLICY
): { valid: boolean; error?: string; finalAmount: number } {
  // Full refund if no amount specified
  const finalAmount = requestedAmount ?? refundableAmount;

  // Check if amount exceeds refundable
  if (finalAmount > refundableAmount) {
    return {
      valid: false,
      error: `Requested amount ${formatAmount(finalAmount, 'usd')} exceeds refundable amount ${formatAmount(refundableAmount, 'usd')}`,
      finalAmount,
    };
  }

  // Check minimum amount
  if (finalAmount < policy.minRefundAmount) {
    return {
      valid: false,
      error: `Refund amount ${formatAmount(finalAmount, 'usd')} is below minimum ${formatAmount(policy.minRefundAmount, 'usd')}`,
      finalAmount,
    };
  }

  // Check percentage limit
  const percentage = (finalAmount / refundableAmount) * 100;
  if (percentage > policy.maxRefundPercentage) {
    return {
      valid: false,
      error: `Refund percentage ${percentage.toFixed(1)}% exceeds maximum ${policy.maxRefundPercentage}%`,
      finalAmount,
    };
  }

  return { valid: true, finalAmount };
}

// ============================================================================
// Refund Validation
// ============================================================================

/**
 * Validate refund request parameters
 */
export function validateRefundRequest(request: RefundRequest): void {
  if (!request.orderId) {
    throw new RefundValidationException('Order ID is required');
  }

  if (!request.paymentIntentId) {
    throw new RefundValidationException('Payment intent ID is required');
  }

  if (!request.customerEmail) {
    throw new RefundValidationException('Customer email is required');
  }

  if (!request.orderDate || !(request.orderDate instanceof Date)) {
    throw new RefundValidationException('Valid order date is required');
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(request.customerEmail)) {
    throw new RefundValidationException('Invalid customer email format');
  }
}

// ============================================================================
// Main Refund Operations
// ============================================================================

/**
 * Create an idempotent refund
 */
export async function createIdempotentRefund(
  request: RefundRequest,
  policy: RefundPolicy = DEFAULT_REFUND_POLICY
): Promise<RefundResponse> {
  // Step 1: Validate request parameters
  validateRefundRequest(request);

  // Step 2: Retrieve payment intent
  const paymentIntent = await getPaymentIntent(request.paymentIntentId);

  // Step 3: Validate eligibility
  const eligibility = validateRefundEligibility(
    paymentIntent,
    request.orderDate,
    policy
  );

  if (!eligibility.eligible) {
    throw new RefundEligibilityException(
      'Order is not eligible for refund',
      eligibility.violations
    );
  }

  // Step 4: Validate refund amount
  const amountValidation = validateRefundAmount(
    request.amount,
    eligibility.refundableAmount,
    policy
  );

  if (!amountValidation.valid) {
    throw new RefundValidationException(amountValidation.error);
  }

  // Step 5: Generate idempotency key
  const idempotencyKey = generateRefundIdempotencyKey(request.orderId);

  // Step 6: Create refund
  try {
    const refund = await createRefund({
      paymentIntentId: request.paymentIntentId,
      amount: amountValidation.finalAmount,
      reason: request.reason || 'requested_by_customer',
      idempotencyKey,
      metadata: {
        orderId: request.orderId,
        customerEmail: request.customerEmail,
        originalAmount: paymentIntent.amountReceived.toString(),
        refundPercentage: (
          (amountValidation.finalAmount / eligibility.refundableAmount) *
          100
        ).toFixed(2),
      },
    });

    return {
      success: true,
      refund,
      refundableAmount: eligibility.refundableAmount,
      requestedAmount: amountValidation.finalAmount,
      message: `Refund of ${formatAmount(refund.amount, refund.currency)} processed successfully`,
    };
  } catch (error) {
    // Handle idempotency conflict
    if (error instanceof Error && error.message.includes('idempotency_key')) {
      throw new RefundStateException(
        'A refund with this idempotency key already exists. Please check the refund status before retrying.'
      );
    }
    throw error;
  }
}

/**
 * Get refund status
 */
export async function getRefundStatus(refundId: string): Promise<RefundResult> {
  try {
    return await getRefund(refundId);
  } catch (error) {
    // Check if this is a Stripe "not found" error
    if (
      error instanceof Error &&
      (error.message.includes('resource_missing') ||
        error.message.includes('No such refund'))
    ) {
      throw new RefundNotFoundException(refundId);
    }
    throw new RefundException(
      `Failed to retrieve refund: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'REFUND_RETRIEVAL_ERROR'
    );
  }
}

/**
 * List refund history for a payment intent
 */
export async function getRefundHistory(
  paymentIntentId: string
): Promise<RefundHistoryEntry[]> {
  const refunds = await listRefundsForPaymentIntent(paymentIntentId);

  return refunds.map((refund) => ({
    refund,
    orderId: refund.metadata.orderId || 'unknown',
    customerEmail: refund.metadata.customerEmail || 'unknown',
    createdAt: refund.createdAt,
  }));
}

// ============================================================================
// Stripe Error Type Assertion
// ============================================================================

// Declare Stripe error types
declare module 'stripe' {
  namespace errors {
    interface StripeError {
      code?: string;
      type?: string;
    }
  }
}

// ============================================================================
// Refund Policy Helpers
// ============================================================================

/**
 * Check if a refund reason is valid
 */
export function isValidRefundReason(
  reason: string,
  policy: RefundPolicy = DEFAULT_REFUND_POLICY
): boolean {
  return policy.allowedReasons.includes(reason as 'duplicate' | 'fraudulent' | 'requested_by_customer');
}

/**
 * Get human-readable refund status message
 */
export function getRefundStatusMessage(status: RefundStatus): string {
  const messages: Record<RefundStatus, string> = {
    [RefundStatus.PENDING]: 'Refund is pending processing',
    [RefundStatus.REQUIRES_ACTION]: 'Refund requires additional action',
    [RefundStatus.SUCCEEDED]: 'Refund has been successfully processed',
    [RefundStatus.FAILED]: 'Refund failed - please contact support',
    [RefundStatus.CANCELED]: 'Refund has been canceled',
  };
  return messages[status] || 'Unknown refund status';
}

/**
 * Format refund details for display
 */
export function formatRefundDetails(refund: RefundResult): string {
  const lines = [
    `**Refund ID:** ${refund.id}`,
    `**Amount:** ${formatAmount(refund.amount, refund.currency)}`,
    `**Status:** ${refund.status}`,
    `**Reason:** ${refund.reason || 'Not specified'}`,
    `**Created:** ${refund.createdAt.toISOString()}`,
  ];

  if (Object.keys(refund.metadata).length > 0) {
    lines.push(`**Metadata:** ${JSON.stringify(refund.metadata)}`);
  }

  return lines.join('\n');
}
