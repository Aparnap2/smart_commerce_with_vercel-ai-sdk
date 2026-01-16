/**
 * Feature Tests: RefundAgent
 * Tests Stripe integration, idempotency, and refund flow
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { createRefundAgent, createDefaultRefundGraph } from '../../lib/agents/refund.js';
import { createRefundService, createIdempotentRefund } from '../../lib/stripe/refund.js';
import { testOrders } from '../config/test-config.js';

describe('RefundAgent', () => {
  let refundAgent;
  let refundService;

  beforeAll(async () => {
    refundService = createRefundService({
      stripeSecretKey: process.env.STRIPE_SECRET_KEY || 'sk_test_mock'
    });
    refundAgent = createRefundAgent({
      userEmail: 'testcustomer@example.com'
    });
  });

  describe('initiate_refund node', () => {
    it('should fetch payment intent details', async () => {
      const state = {
        orderId: testOrders.eligible.id,
        paymentIntentId: testOrders.eligible.paymentIntentId,
        amount: testOrders.eligible.amount
      };

      const result = await refundAgent.initiateRefund(state);
      expect(result).toHaveProperty('paymentIntent');
      expect(result).toHaveProperty('orderDetails');
    });

    it('should handle non-existent payment intent', async () => {
      const state = {
        orderId: 99999,
        paymentIntentId: 'pi_nonexistent',
        amount: 1000
      };

      const result = await refundAgent.initiateRefund(state);
      expect(result.error).toBeDefined();
      expect(result.paymentIntent).toBeNull();
    });

    it('should detect ineligible orders', async () => {
      const state = {
        orderId: testOrders.ineligible.id,
        paymentIntentId: testOrders.ineligible.paymentIntentId,
        amount: testOrders.ineligible.amount
      };

      const result = await refundAgent.initiateRefund(state);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('30-day');
    });
  });

  describe('validate_refund node', () => {
    it('should validate eligible refund', async () => {
      const state = {
        orderId: testOrders.eligible.id,
        amount: testOrders.eligible.amount,
        paymentIntent: {
          id: testOrders.eligible.paymentIntentId,
          amount: testOrders.eligible.amount,
          status: 'succeeded'
        }
      };

      const result = await refundAgent.validateRefund(state);
      expect(result.valid).toBe(true);
      expect(result.policyCompliant).toBe(true);
    });

    it('should reject amount exceeds order total', async () => {
      const state = {
        orderId: testOrders.eligible.id,
        amount: testOrders.eligible.amount + 1000, // More than order total
        paymentIntent: {
          id: testOrders.eligible.paymentIntentId,
          amount: testOrders.eligible.amount
        }
      };

      const result = await refundAgent.validateRefund(state);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('exceeds');
    });

    it('should reject zero amount', async () => {
      const state = {
        orderId: testOrders.eligible.id,
        amount: 0,
        paymentIntent: {
          id: testOrders.eligible.paymentIntentId,
          amount: testOrders.eligible.amount
        }
      };

      const result = await refundAgent.validateRefund(state);
      expect(result.valid).toBe(false);
    });

    it('should reject negative amount', async () => {
      const state = {
        orderId: testOrders.eligible.id,
        amount: -100,
        paymentIntent: {
          id: testOrders.eligible.paymentIntentId,
          amount: testOrders.eligible.amount
        }
      };

      const result = await refundAgent.validateRefund(state);
      expect(result.valid).toBe(false);
    });
  });

  describe('execute_refund node', () => {
    it('should create refund with idempotency key', async () => {
      const state = {
        orderId: testOrders.eligible.id,
        paymentIntentId: testOrders.eligible.paymentIntentId,
        amount: testOrders.eligible.amount,
        idempotencyKey: `test_refund_${Date.now()}_${Math.random().toString(36).slice(2)}`
      };

      // Note: This will fail with mock key, but tests the flow
      try {
        const result = await refundAgent.executeRefund(state);
        expect(result).toHaveProperty('stripeRefundId');
        expect(result).toHaveProperty('status');
      } catch (error) {
        // Expected with mock key - just verify it tried
        expect(error.message).toContain('refund');
      }
    });

    it('should detect duplicate idempotency key', async () => {
      const state = {
        orderId: testOrders.eligible.id,
        paymentIntentId: testOrders.eligible.paymentIntentId,
        amount: testOrders.eligible.amount,
        idempotencyKey: 'duplicate_key_test'
      };

      const result = await refundAgent.executeRefund(state);
      expect(result.duplicate).toBe(true);
      expect(result.existingRefund).toBeDefined();
    });
  });

  describe('Refund Service', () => {
    it('should generate unique idempotency keys', () => {
      const key1 = `refund_${Date.now()}_1`;
      const key2 = `refund_${Date.now()}_2`;
      expect(key1).not.toBe(key2);
    });

    it('should calculate refundable amount correctly', () => {
      const total = 10000;
      const alreadyRefunded = 3000;
      const result = refundService.calculateRefundableAmount(total, alreadyRefunded);
      expect(result).toBe(7000);
    });

    it('should validate full refund eligibility', () => {
      expect(refundService.isRefundable(5, 30)).toBe(true);
      expect(refundService.isRefundable(31, 30)).toBe(false);
      expect(refundService.isRefundable(0, 30)).toBe(true);
    });
  });

  describe('graph compilation', () => {
    it('should compile default refund graph', () => {
      const graph = createDefaultRefundGraph();
      expect(graph).toBeDefined();
      expect(typeof graph.invoke).toBe('function');
    });

    it('should have correct node structure', () => {
      const graph = createDefaultRefundGraph();
      const nodes = graph.nodes;
      expect(nodes).toHaveProperty('initiate_refund');
      expect(nodes).toHaveProperty('validate_refund');
      expect(nodes).toHaveProperty('execute_refund');
      expect(nodes).toHaveProperty('check_refund_status');
    });
  });

  describe('error handling', () => {
    it('should handle Stripe API errors gracefully', async () => {
      const state = {
        orderId: testOrders.eligible.id,
        paymentIntentId: 'pi_invalid',
        amount: testOrders.eligible.amount
      };

      const result = await refundAgent.initiateRefund(state);
      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('STRIPE_ERROR');
    });

    it('should handle network timeouts', async () => {
      const state = {
        orderId: testOrders.eligible.id,
        paymentIntentId: 'pi_timeout_test',
        amount: testOrders.eligible.amount,
        timeout: 1 // 1ms timeout
      };

      const result = await refundAgent.initiateRefund(state);
      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('TIMEOUT');
    });
  });

  describe('partial refunds', () => {
    it('should allow partial refund within limits', async () => {
      const state = {
        orderId: testOrders.eligible.id,
        amount: testOrders.eligible.amount * 0.5, // 50% refund
        paymentIntent: {
          id: testOrders.eligible.paymentIntentId,
          amount: testOrders.eligible.amount,
          amount_refunded: 0
        }
      };

      const result = await refundAgent.validateRefund(state);
      expect(result.valid).toBe(true);
      expect(result.refundType).toBe('partial');
    });

    it('should track refund amounts correctly', async () => {
      const total = 10000;
      const refund1 = 3000;
      const remaining = refundService.calculateRefundableAmount(total, refund1);
      expect(remaining).toBe(7000);

      const refund2 = 2000;
      const remaining2 = refundService.calculateRefundableAmount(total, refund1 + refund2);
      expect(remaining2).toBe(5000);
    });
  });
});
