/**
 * Stripe Webhook Handler - Refund event processing with idempotency
 *
 * Handles Stripe webhook events for:
 * - refund.created
 * - refund.succeeded
 * - refund.failed
 * - refund.canceled
 *
 * Features:
 * - Signature verification
 * - Idempotency validation
 * - Database synchronization
 * - Error handling with proper HTTP status codes
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  verifyWebhookSignature,
  formatAmount,
  RefundStatus,
} from '../../../../lib/stripe/client';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Refund event payload from Stripe
 */
interface RefundEventPayload {
  id: string;
  object: 'refund';
  amount: number;
  currency: string;
  payment_intent: string;
  charge: string | null;
  status: string;
  reason: string | null;
  created: number;
  metadata: Record<string, string>;
}

/**
 * Database record for refund tracking
 */
interface RefundRecord {
  stripeRefundId: string;
  paymentIntentId: string;
  orderId: string | null;
  customerEmail: string | null;
  amount: number;
  currency: string;
  status: RefundStatus;
  reason: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  eventId: string;
}

/**
 * Webhook processing result
 */
interface WebhookResult {
  success: boolean;
  message: string;
  refundId?: string;
  error?: string;
}

// ============================================================================
// Database Operations (Mock - replace with actual Prisma implementation)
// ============================================================================

/**
 * Store refund record in database
 */
async function upsertRefundRecord(record: RefundRecord): Promise<void> {
  // In production, this would use Prisma to upsert the record
  // For now, we log the operation
  console.log('[WEBHOOK] Upserting refund record:', {
    stripeRefundId: record.stripeRefundId,
    status: record.status,
    orderId: record.orderId,
  });

  // Mock database operation
  // await prisma.refund.upsert({
  //   where: { stripeRefundId: record.stripeRefundId },
  //   update: { ...record },
  //   create: record,
  // });
}

/**
 * Check if webhook event was already processed (idempotency)
 */
async function isEventProcessed(eventId: string): Promise<boolean> {
  // In production, check database for event ID
  console.log('[WEBHOOK] Checking event idempotency:', eventId);

  // Mock: Check if event was already processed
  // return await prisma.webhookEvent.exists({ where: { eventId } });
  return false;
}

/**
 * Mark webhook event as processed
 */
async function markEventProcessed(eventId: string): Promise<void> {
  console.log('[WEBHOOK] Marking event as processed:', eventId);

  // In production, store event ID in database
  // await prisma.webhookEvent.create({
  //   data: { eventId, processedAt: new Date() },
  // });
}

/**
 * Update order status after refund
 */
async function updateOrderStatus(
  orderId: string,
  refundStatus: RefundStatus
): Promise<void> {
  console.log('[WEBHOOK] Updating order status:', { orderId, refundStatus });

  // In production, update the order record
  // await prisma.order.update({
  //   where: { id: orderId },
  //   data: { refundStatus },
  // });
}

/**
 * Get order by refund metadata
 */
async function getOrderByRefund(refund: RefundEventPayload): Promise<string | null> {
  return refund.metadata?.orderId || null;
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle refund.created event
 */
async function handleRefundCreated(refund: RefundEventPayload): Promise<WebhookResult> {
  console.log('[WEBHOOK] Processing refund.created:', refund.id);

  const orderId = await getOrderByRefund(refund);

  await upsertRefundRecord({
    stripeRefundId: refund.id,
    paymentIntentId: refund.payment_intent,
    orderId,
    customerEmail: refund.metadata?.customerEmail || null,
    amount: refund.amount,
    currency: refund.currency,
    status: RefundStatus.PENDING,
    reason: refund.reason,
    idempotencyKey: refund.metadata?.idempotencyKey || null,
    createdAt: new Date(refund.created * 1000),
    updatedAt: new Date(),
    eventId: '',
  });

  return {
    success: true,
    message: `Refund ${refund.id} created successfully`,
    refundId: refund.id,
  };
}

/**
 * Handle refund.succeeded event
 */
async function handleRefundSucceeded(refund: RefundEventPayload): Promise<WebhookResult> {
  console.log('[WEBHOOK] Processing refund.succeeded:', refund.id);

  const orderId = await getOrderByRefund(refund);

  await upsertRefundRecord({
    stripeRefundId: refund.id,
    paymentIntentId: refund.payment_intent,
    orderId,
    customerEmail: refund.metadata?.customerEmail || null,
    amount: refund.amount,
    currency: refund.currency,
    status: RefundStatus.SUCCEEDED,
    reason: refund.reason,
    idempotencyKey: refund.metadata?.idempotencyKey || null,
    createdAt: new Date(refund.created * 1000),
    updatedAt: new Date(),
    eventId: '',
  });

  // Update order status if order ID is available
  if (orderId) {
    await updateOrderStatus(orderId, RefundStatus.SUCCEEDED);
  }

  const formattedAmount = formatAmount(refund.amount, refund.currency);

  return {
    success: true,
    message: `Refund ${refund.id} succeeded - ${formattedAmount}`,
    refundId: refund.id,
  };
}

/**
 * Handle refund.failed event
 */
async function handleRefundFailed(refund: RefundEventPayload): Promise<WebhookResult> {
  console.log('[WEBHOOK] Processing refund.failed:', refund.id);

  const orderId = await getOrderByRefund(refund);

  await upsertRefundRecord({
    stripeRefundId: refund.id,
    paymentIntentId: refund.payment_intent,
    orderId,
    customerEmail: refund.metadata?.customerEmail || null,
    amount: refund.amount,
    currency: refund.currency,
    status: RefundStatus.FAILED,
    reason: refund.reason,
    idempotencyKey: refund.metadata?.idempotencyKey || null,
    createdAt: new Date(refund.created * 1000),
    updatedAt: new Date(),
    eventId: '',
  });

  // Update order status if order ID is available
  if (orderId) {
    await updateOrderStatus(orderId, RefundStatus.FAILED);
  }

  return {
    success: true,
    message: `Refund ${refund.id} failed - manual intervention may be required`,
    refundId: refund.id,
  };
}

/**
 * Handle refund.canceled event
 */
async function handleRefundCanceled(refund: RefundEventPayload): Promise<WebhookResult> {
  console.log('[WEBHOOK] Processing refund.canceled:', refund.id);

  const orderId = await getOrderByRefund(refund);

  await upsertRefundRecord({
    stripeRefundId: refund.id,
    paymentIntentId: refund.payment_intent,
    orderId,
    customerEmail: refund.metadata?.customerEmail || null,
    amount: refund.amount,
    currency: refund.currency,
    status: RefundStatus.CANCELED,
    reason: refund.reason,
    idempotencyKey: refund.metadata?.idempotencyKey || null,
    createdAt: new Date(refund.created * 1000),
    updatedAt: new Date(),
    eventId: '',
  });

  // Update order status if order ID is available
  if (orderId) {
    await updateOrderStatus(orderId, RefundStatus.CANCELED);
  }

  return {
    success: true,
    message: `Refund ${refund.id} canceled`,
    refundId: refund.id,
  };
}

// ============================================================================
// Main Webhook Handler
// ============================================================================

/**
 * Process Stripe webhook events
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  console.log(`[WEBHOOK][${requestId}] Processing webhook request`);

  try {
    // Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      console.error(`[WEBHOOK][${requestId}] Missing stripe-signature header`);
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = verifyWebhookSignature(body, signature);
    } catch (sigError) {
      console.error(`[WEBHOOK][${requestId}] Signature verification failed:`, sigError);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    console.log(`[WEBHOOK][${requestId}] Event type: ${event.type}, ID: ${event.id}`);

    // Check for duplicate event (idempotency)
    if (await isEventProcessed(event.id)) {
      console.log(`[WEBHOOK][${requestId}] Event already processed, skipping`);
      return NextResponse.json(
        { message: 'Event already processed' },
        { status: 200 }
      );
    }

    // Handle refund events
    let result: WebhookResult;
    const eventType = event.type as string;

    switch (eventType) {
      case 'refund.created':
        result = await handleRefundCreated(event.data.object as RefundEventPayload);
        break;

      case 'refund.succeeded':
        result = await handleRefundSucceeded(event.data.object as RefundEventPayload);
        break;

      case 'refund.failed':
        result = await handleRefundFailed(event.data.object as RefundEventPayload);
        break;

      case 'refund.canceled':
        result = await handleRefundCanceled(event.data.object as RefundEventPayload);
        break;

      default:
        console.log(`[WEBHOOK][${requestId}] Ignoring event type: ${event.type}`);
        return NextResponse.json(
          { message: `Event type ${event.type} not handled` },
          { status: 200 }
        );
    }

    // Mark event as processed
    await markEventProcessed(event.id);

    console.log(`[WEBHOOK][${requestId}] Webhook processed successfully:`, result);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error(`[WEBHOOK][${requestId}] Webhook processing failed:`, {
      message: errorMessage,
      stack: errorStack,
    });

    // Return 500 to trigger Stripe retry
    return NextResponse.json(
      {
        error: 'Webhook processing failed',
        message: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Health Check Endpoint
// ============================================================================

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'stripe-refund-webhook',
  });
}
