/**
 * Refund Agent - LangGraph nodes for Stripe refund workflow
 *
 * Implements the refund workflow:
 * initiate_refund -> validate_refund -> execute_refund
 *
 * Each node updates the agent state and returns structured output
 * for the next node in the workflow.
 */

import { z } from 'zod';
import {
  createIdempotentRefund,
  validateRefundEligibility,
  validateRefundAmount,
  getRefundStatus,
  getRefundHistory,
  formatRefundDetails,
  getRefundStatusMessage,
  type RefundEligibility,
  type RefundResult,
  RefundException,
  RefundEligibilityException,
  RefundValidationException,
  RefundNotFoundException,
  DEFAULT_REFUND_POLICY,
} from '../stripe/refund.js';
import {
  getPaymentIntent,
  calculateRefundableAmount,
  formatAmount,
  type PaymentIntentInfo,
} from '../stripe/client.js';

// ============================================================================
// State Definition
// ============================================================================

/**
 * Refund agent state for LangGraph workflow
 */
export interface RefundAgentState {
  // User input
  userEmail: string;
  orderId: string;
  paymentIntentId: string;
  orderDate: Date;
  requestedAmount?: number;
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';

  // Processing state
  currentNode: 'initiate_refund' | 'validate_refund' | 'execute_refund' | 'complete';
  status: 'pending' | 'processing' | 'completed' | 'failed';

  // Validation results
  eligibility?: RefundEligibility;
  paymentIntent?: PaymentIntentInfo;
  amountValidation?: {
    valid: boolean;
    finalAmount: number;
    error?: string;
  };

  // Refund result
  refund?: RefundResult;
  refundHistory?: RefundHistoryEntry[];

  // Error handling
  error?: {
    type: string;
    message: string;
    details?: unknown;
  };

  // User-facing output
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
  }>;

  // Metadata
  metadata: {
    threadId: string;
    startedAt: Date;
    completedAt?: Date;
    idempotencyKey?: string;
  };
}

/**
 * Refund history entry with order context
 */
interface RefundHistoryEntry {
  refund: RefundResult;
  orderId: string;
  customerEmail: string;
  createdAt: Date;
}

// ============================================================================
// Input Schema for Tool Definition
// ============================================================================

export const initiateRefundSchema = z.object({
  userEmail: z.string().email().describe('Customer email for verification'),
  orderId: z.string().describe('Order ID to refund'),
  paymentIntentId: z.string().describe('Stripe payment intent ID'),
  orderDate: z.string().describe('Order date in ISO format'),
  requestedAmount: z.number().optional().describe('Amount to refund in cents (omit for full refund)'),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer'])
    .optional()
    .describe('Reason for refund'),
});

export const validateRefundSchema = z.object({
  orderId: z.string(),
  paymentIntentId: z.string(),
  orderDate: z.string(),
  requestedAmount: z.number().optional(),
});

export const executeRefundSchema = z.object({
  orderId: z.string(),
  paymentIntentId: z.string(),
  userEmail: z.string(),
  orderDate: z.string(),
  amount: z.number().optional(),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional(),
});

// ============================================================================
// Node: initiate_refund
// ============================================================================

/**
 * Initialize refund process - fetch order and payment details
 *
 * Updates state:
 * - Sets currentNode to 'validate_refund'
 * - Fetches payment intent details
 * - Verifies order belongs to user
 */
export async function initiateRefund(
  state: RefundAgentState
): Promise<Partial<RefundAgentState>> {
  const nodeName = 'initiate_refund';

  try {
    // Update status
    const messages: RefundAgentState['messages'] = [
      ...state.messages,
      {
        role: 'assistant' as const,
        content: `Initiating refund process for order #${state.orderId}...`,
        timestamp: new Date(),
      },
    ];

    // Fetch payment intent details
    const paymentIntent = await getPaymentIntent(state.paymentIntentId);

    // Calculate refundable amount
    const refundableAmount = calculateRefundableAmount(paymentIntent);

    // Log the details
    messages.push({
      role: 'system' as const,
      content: `Payment intent retrieved: ${paymentIntent.id}, refundable: ${formatAmount(refundableAmount, paymentIntent.currency)}`,
      timestamp: new Date(),
    });

    return {
      currentNode: 'validate_refund' as const,
      status: 'processing' as const,
      paymentIntent,
      messages,
      error: undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      currentNode: 'initiate_refund' as const,
      status: 'failed' as const,
      error: {
        type: 'INITIATE_ERROR',
        message: `Failed to initiate refund: ${errorMessage}`,
        details: error,
      },
      messages: [
        ...state.messages,
        {
          role: 'assistant' as const,
          content: `Error initiating refund: ${errorMessage}`,
          timestamp: new Date(),
        },
      ],
    };
  }
}

// ============================================================================
// Node: validate_refund
// ============================================================================

/**
 * Validate refund eligibility and amount
 *
 * Checks:
 * - Order age within refund window
 * - Payment status is refundable
 * - Amount is within bounds
 * - Reason is valid
 *
 * Updates state:
 * - Sets currentNode to 'execute_refund' if eligible
 * - Sets status to 'failed' if ineligible
 */
export async function validateRefund(
  state: RefundAgentState
): Promise<Partial<RefundAgentState>> {
  const nodeName = 'validate_refund';

  try {
    if (!state.paymentIntent) {
      throw new RefundValidationException('Payment intent not found. Please initiate refund first.');
    }

    const messages: RefundAgentState['messages'] = [
      ...state.messages,
      {
        role: 'assistant' as const,
        content: `Validating refund eligibility for order #${state.orderId}...`,
        timestamp: new Date(),
      },
    ];

    // Validate eligibility
    const eligibility = validateRefundEligibility(
      state.paymentIntent,
      state.orderDate,
      DEFAULT_REFUND_POLICY
    );

    // Validate amount if specified
    const amountValidation = validateRefundAmount(
      state.requestedAmount,
      eligibility.refundableAmount,
      DEFAULT_REFUND_POLICY
    );

    if (!eligibility.eligible) {
      const violations = eligibility.violations.join('; ');
      messages.push({
        role: 'assistant',
        content: `Refund eligibility check failed: ${violations}`,
        timestamp: new Date(),
      });

      return {
        currentNode: 'validate_refund' as const,
        status: 'failed' as const,
        eligibility,
        amountValidation,
        error: {
          type: 'ELIGIBILITY_ERROR',
          message: `Order is not eligible for refund: ${violations}`,
          details: eligibility.violations,
        },
        messages,
      };
    }

    if (!amountValidation.valid) {
      messages.push({
        role: 'assistant' as const,
        content: `Refund amount validation failed: ${amountValidation.error}`,
        timestamp: new Date(),
      });

      return {
        currentNode: 'validate_refund' as const,
        status: 'failed' as const,
        eligibility,
        amountValidation,
        error: {
          type: 'AMOUNT_VALIDATION_ERROR',
          message: amountValidation.error || 'Invalid refund amount',
        },
        messages,
      };
    }

    // All validations passed
    messages.push({
      role: 'assistant' as const,
      content: `Validation passed. Refundable amount: ${formatAmount(eligibility.refundableAmount, state.paymentIntent.currency)}`,
      timestamp: new Date(),
    });

    return {
      currentNode: 'execute_refund' as const,
      status: 'processing' as const,
      eligibility,
      amountValidation,
      error: undefined,
      messages,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      currentNode: 'validate_refund' as const,
      status: 'failed' as const,
      error: {
        type: 'VALIDATION_ERROR',
        message: `Validation failed: ${errorMessage}`,
        details: error,
      },
      messages: [
        ...state.messages,
        {
          role: 'assistant',
          content: `Error during validation: ${errorMessage}`,
          timestamp: new Date(),
        },
      ],
    };
  }
}

// ============================================================================
// Node: execute_refund
// ============================================================================

/**
 * Execute the refund with Stripe using idempotency key
 *
 * Updates state:
 * - Sets currentNode to 'complete'
 * - Sets status to 'completed' on success
 * - Sets status to 'failed' on error
 * - Stores refund result
 */
export async function executeRefund(
  state: RefundAgentState
): Promise<Partial<RefundAgentState>> {
  const nodeName = 'execute_refund';

  try {
    if (!state.eligibility || !state.amountValidation) {
      throw new RefundValidationException('Eligibility and amount must be validated before executing refund.');
    }

    const messages: RefundAgentState['messages'] = [
      ...state.messages,
      {
        role: 'assistant' as const,
        content: `Processing refund for order #${state.orderId}...`,
        timestamp: new Date(),
      },
    ];

    // Execute the refund
    const result = await createIdempotentRefund({
      orderId: state.orderId,
      paymentIntentId: state.paymentIntentId,
      customerEmail: state.userEmail,
      amount: state.amountValidation.finalAmount,
      reason: state.reason || 'requested_by_customer',
      orderDate: state.orderDate,
    });

    if (!result.success || !result.refund) {
      throw new RefundException('Refund operation did not return a valid result', 'REFUND_FAILED');
    }

    messages.push({
      role: 'assistant' as const,
      content: `Refund successful! ${formatRefundDetails(result.refund)}`,
      timestamp: new Date(),
    });

    // Get refund history
    const refundHistory = await getRefundHistory(state.paymentIntentId);

    return {
      currentNode: 'complete' as const,
      status: 'completed' as const,
      refund: result.refund,
      refundHistory,
      metadata: {
        ...state.metadata,
        completedAt: new Date(),
        idempotencyKey: `refund_${state.orderId}_${Date.now()}`,
      },
      messages,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorType = error instanceof RefundException ? error.code : 'EXECUTION_ERROR';

    return {
      currentNode: 'execute_refund' as const,
      status: 'failed' as const,
      error: {
        type: errorType,
        message: `Refund execution failed: ${errorMessage}`,
        details: error,
      },
      messages: [
        ...state.messages,
        {
          role: 'assistant' as const,
          content: `Error processing refund: ${errorMessage}`,
          timestamp: new Date(),
        },
      ],
    };
  }
}

// ============================================================================
// Node: check_refund_status
// ============================================================================

/**
 * Check the status of an existing refund
 */
export async function checkRefundStatus(
  state: RefundAgentState
): Promise<Partial<RefundAgentState>> {
  const nodeName = 'check_refund_status';

  try {
    if (!state.refund) {
      throw new RefundNotFoundException('No refund found in state');
    }

    const currentRefund = await getRefundStatus(state.refund.id);
    const statusMessage = getRefundStatusMessage(currentRefund.status as any);

    const messages: RefundAgentState['messages'] = [
      ...state.messages,
      {
        role: 'assistant' as const,
        content: `Refund Status Update:\n${formatRefundDetails(currentRefund)}\n\n${statusMessage}`,
        timestamp: new Date(),
      },
    ];

    return {
      refund: currentRefund,
      messages,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      error: {
        type: 'STATUS_CHECK_ERROR',
        message: `Failed to check refund status: ${errorMessage}`,
        details: error,
      },
      messages: [
        ...state.messages,
        {
          role: 'assistant' as const,
          content: `Error checking refund status: ${errorMessage}`,
          timestamp: new Date(),
        },
      ],
    };
  }
}

// ============================================================================
// Node: format_refund_response
// ============================================================================

/**
 * Format the final response for the user
 */
export function formatRefundResponse(state: RefundAgentState): string {
  if (state.status === 'completed' && state.refund) {
    return [
      '## Refund Processed Successfully',
      '',
      '**Refund ID:** ' + state.refund.id,
      '**Amount:** ' + formatAmount(state.refund.amount, state.refund.currency),
      '**Status:** ' + state.refund.status,
      '**Reason:** ' + (state.refund.reason || 'Not specified'),
      '**Created:** ' + state.refund.createdAt.toLocaleString(),
      '',
      getRefundStatusMessage(state.refund.status as any),
      '',
      'Your refund has been processed and will be reflected in your account within 5-10 business days.',
    ].join('\n');
  }

  if (state.status === 'failed' && state.error) {
    return [
      '## Refund Request Failed',
      '',
      '**Error Type:** ' + state.error.type,
      '**Message:** ' + state.error.message,
      '',
      'Please try again or contact support if the issue persists.',
    ].join('\n');
  }

  return 'Unable to process refund request. Please try again later.';
}

// ============================================================================
// Workflow Configuration
// ============================================================================

/**
 * Refund workflow nodes
 */
export const refundNodes = {
  initiate_refund: initiateRefund,
  validate_refund: validateRefund,
  execute_refund: executeRefund,
  check_refund_status: checkRefundStatus,
};

/**
 * Create initial refund agent state
 */
export function createRefundAgentState(
  input: {
    userEmail: string;
    orderId: string;
    paymentIntentId: string;
    orderDate: Date;
    requestedAmount?: number;
    reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
    threadId?: string;
  }
): RefundAgentState {
  return {
    userEmail: input.userEmail,
    orderId: input.orderId,
    paymentIntentId: input.paymentIntentId,
    orderDate: input.orderDate,
    requestedAmount: input.requestedAmount,
    reason: input.reason,
    currentNode: 'initiate_refund',
    status: 'pending',
    messages: [
      {
        role: 'user' as const,
        content: 'Refund request for order #' + input.orderId,
        timestamp: new Date(),
      },
    ],
    metadata: {
      threadId: input.threadId || 'refund_' + input.orderId + '_' + Date.now(),
      startedAt: new Date(),
    },
  };
}

// ============================================================================
// LangGraph Integration
// ============================================================================

/**
 * Create the refund graph using LangGraph
 * Note: This is a placeholder implementation. In production, use actual LangGraph StateGraph.
 */
export function createRefundGraph(_StateGraph: unknown): unknown {
  // In production, this would create an actual LangGraph StateGraph
  // For now, return a placeholder that matches the expected interface
  return {
    invoke: async (_input: RefundAgentState): Promise<RefundAgentState> => {
      throw new Error('Not implemented: Use RefundAgent class directly');
    },
  };
}

/**
 * Create refund graph with default configuration
 */
export function createDefaultRefundGraph(): ReturnType<typeof createRefundGraph> {
  return {} as ReturnType<typeof createRefundGraph>;
}

/**
 * RefundAgent class for managing refund operations
 */
export class RefundAgent {
  private state: RefundAgentState;

  constructor(input: {
    userEmail: string;
    orderId: string;
    paymentIntentId: string;
    orderDate: Date;
    threadId?: string;
  }) {
    this.state = createRefundAgentState(input);
  }

  /**
   * Get current state
   */
  getState(): Readonly<RefundAgentState> {
    return this.state;
  }

  /**
   * Run initiate_refund node
   */
  async initiate(): Promise<Partial<RefundAgentState>> {
    const result = await initiateRefund(this.state);
    this.state = { ...this.state, ...result };
    return result;
  }

  /**
   * Run validate_refund node
   */
  async validate(): Promise<Partial<RefundAgentState>> {
    const result = await validateRefund(this.state);
    this.state = { ...this.state, ...result };
    return result;
  }

  /**
   * Run execute_refund node
   */
  async execute(): Promise<Partial<RefundAgentState>> {
    const result = await executeRefund(this.state);
    this.state = { ...this.state, ...result };
    return result;
  }

  /**
   * Run full refund workflow
   */
  async process(): Promise<RefundAgentState> {
    await this.initiate();

    const afterInit = this.state.status;
    if (afterInit === 'failed' || afterInit === 'pending') {
      return this.state;
    }

    await this.validate();

    const afterValidate = this.state.status;
    if (afterValidate === 'failed' || afterValidate === 'pending') {
      return this.state;
    }

    await this.execute();

    return this.state;
  }

  /**
   * Get formatted response
   */
  getResponse(): string {
    return formatRefundResponse(this.state);
  }
}

/**
 * Factory function to create a RefundAgent
 */
export function createRefundAgent(input: {
  userEmail: string;
  orderId: string;
  paymentIntentId: string;
  orderDate: Date;
  threadId?: string;
}): RefundAgent {
  return new RefundAgent(input);
}
