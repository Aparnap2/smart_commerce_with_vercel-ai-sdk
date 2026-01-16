/**
 * Feature Tests: Supervisor Agent
 * Tests intent classification and agent routing
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { createSupervisorAgent, createDefaultSupervisorGraph } from '../../lib/agents/supervisor.js';
import { dockerServices } from '../config/test-config.js';

describe('Supervisor Agent - Intent Classification', () => {
  let supervisor;

  beforeAll(async () => {
    supervisor = createSupervisorAgent();
  });

  describe('classify_query', () => {
    it('should classify refund requests correctly', async () => {
      const testQueries = [
        'I want to refund my order #123',
        'How do I get a refund?',
        'Cancel my purchase and give me money back',
        'The product is damaged, please process a refund',
        'I\'d like to return this item for a refund'
      ];

      for (const query of testQueries) {
        const intent = await supervisor.classifyQuery(query);
        expect(intent.type).toBe('refund_request');
        expect(intent.confidence).toBeGreaterThan(0.7);
      }
    });

    it('should classify order inquiries correctly', async () => {
      const testQueries = [
        'Where is my order?',
        'Track my package #456',
        'When will my order arrive?',
        'Order status for #789',
        'Has my order been shipped?'
      ];

      for (const query of testQueries) {
        const intent = await supervisor.classifyQuery(query);
        expect(intent.type).toBe('order_inquiry');
        expect(intent.confidence).toBeGreaterThan(0.7);
      }
    });

    it('should classify product searches correctly', async () => {
      const testQueries = [
        'Show me wireless headphones',
        'Do you have laptops in stock?',
        'What products do you sell?',
        'Find me a smartphone under $500',
        'Tell me about the new laptop Pro'
      ];

      for (const query of testQueries) {
        const intent = await supervisor.classifyQuery(query);
        expect(intent.type).toBe('product_search');
        expect(intent.confidence).toBeGreaterThan(0.6);
      }
    });

    it('should classify ticket creation correctly', async () => {
      const testQueries = [
        'I need to open a support ticket',
        'File a complaint about my order',
        'Contact customer service',
        'Report an issue with my purchase',
        'I have a problem that needs help'
      ];

      for (const query of testQueries) {
        const intent = await supervisor.classifyQuery(query);
        expect(intent.type).toBe('ticket_create');
        expect(intent.confidence).toBeGreaterThan(0.6);
      }
    });

    it('should classify general support correctly', async () => {
      const testQueries = [
        'Hello',
        'Thanks for your help',
        'Goodbye',
        'How does this work?',
        'What are your hours?'
      ];

      for (const query of testQueries) {
        const intent = await supervisor.classifyQuery(query);
        expect(intent.type).toBe('general_support');
        expect(intent.confidence).toBeGreaterThan(0.5);
      }
    });
  });

  describe('route_to_agent', () => {
    it('should route refund requests to RefundAgent', async () => {
      const routing = await supervisor.routeToAgent({ type: 'refund_request' });
      expect(routing.nextAgent).toBe('RefundAgent');
    });

    it('should route order inquiries to ToolAgent', async () => {
      const routing = await supervisor.routeToAgent({ type: 'order_inquiry' });
      expect(routing.nextAgent).toBe('ToolAgent');
    });

    it('should route product searches to ToolAgent', async () => {
      const routing = await supervisor.routeToAgent({ type: 'product_search' });
      expect(routing.nextAgent).toBe('ToolAgent');
    });

    it('should route ticket creation to ToolAgent', async () => {
      const routing = await supervisor.routeToAgent({ type: 'ticket_create' });
      expect(routing.nextAgent).toBe('ToolAgent');
    });

    it('should route general support to UIAgent', async () => {
      const routing = await supervisor.routeToAgent({ type: 'general_support' });
      expect(routing.nextAgent).toBe('UIAgent');
    });
  });

  describe('graph compilation', () => {
    it('should compile default supervisor graph', () => {
      const graph = createDefaultSupervisorGraph();
      expect(graph).toBeDefined();
      expect(typeof graph.invoke).toBe('function');
      expect(typeof graph.stream).toBe('function');
    });

    it('should have correct node structure', () => {
      const graph = createDefaultSupervisorGraph();
      const nodes = graph.nodes;
      expect(nodes).toHaveProperty('classify_query');
      expect(nodes).toHaveProperty('route_to_agent');
      expect(nodes).toHaveProperty('reflect');
    });
  });

  describe('error handling', () => {
    it('should handle empty queries gracefully', async () => {
      const intent = await supervisor.classifyQuery('');
      expect(intent.type).toBe('general_support');
    });

    it('should handle malformed queries', async () => {
      const intent = await supervisor.classifyQuery('!!!@@@###$$$');
      expect(intent.type).toBeDefined();
      expect(intent.confidence).toBeLessThan(0.5);
    });

    it('should handle very long queries', async () => {
      const longQuery = 'I want to refund my order because '.repeat(50);
      const intent = await supervisor.classifyQuery(longQuery);
      expect(intent.type).toBe('refund_request');
    });
  });

  describe('performance', () => {
    it('should classify query within 2 seconds', async () => {
      const start = Date.now();
      await supervisor.classifyQuery('I want to refund my order');
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000);
    });

    it('should handle concurrent classifications', async () => {
      const queries = Array(10).fill('I want to refund my order');
      const start = Date.now();
      await Promise.all(queries.map(q => supervisor.classifyQuery(q)));
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000);
    });
  });
});
