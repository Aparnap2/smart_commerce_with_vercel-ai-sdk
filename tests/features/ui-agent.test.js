/**
 * Feature Tests: UIAgent
 * Tests response formatting, SSE streaming, and chart data
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { createUIAgent, createDefaultUIGraph } from '../../lib/agents/ui.js';
import { createSSEStream, formatResponse } from '../../lib/agents/ui.js';

describe('UIAgent', () => {
  let uiAgent;

  beforeAll(async () => {
    uiAgent = createUIAgent();
  });

  describe('format_response node', () => {
    it('should format refund response', async () => {
      const state = {
        intent: 'refund_request',
        toolResults: {
          data: {
            refundId: 're_123',
            amount: 9999,
            status: 'succeeded'
          }
        }
      };

      const result = await uiAgent.formatResponse(state);
      expect(result).toHaveProperty('formattedResponse');
      expect(result).toHaveProperty('chartData');
      expect(result).toHaveProperty('message');
    });

    it('should format order response with table', async () => {
      const state = {
        intent: 'order_inquiry',
        toolResults: {
          data: {
            orders: [
              { id: 1, product: 'Laptop', total: 999, status: 'delivered' },
              { id: 2, product: 'Mouse', total: 29, status: 'shipped' }
            ]
          }
        }
      };

      const result = await uiAgent.formatResponse(state);
      expect(result.formattedResponse).toContain('Laptop');
      expect(result.chartData).toHaveProperty('orders');
    });

    it('should format product search results', async () => {
      const state = {
        intent: 'product_search',
        toolResults: {
          data: {
            products: [
              { id: 1, name: 'Headphones', price: 99, stock: 10 },
              { id: 2, name: 'Earbuds', price: 49, stock: 50 }
            ]
          }
        }
      };

      const result = await uiAgent.formatResponse(state);
      expect(result.formattedResponse).toContain('Headphones');
      expect(result.chartData).toHaveProperty('products');
    });

    it('should format support ticket response', async () => {
      const state = {
        intent: 'ticket_create',
        toolResults: {
          data: {
            ticketId: 'TKT-123',
            status: 'open',
            priority: 'high'
          }
        }
      };

      const result = await uiAgent.formatResponse(state);
      expect(result.message).toContain('TKT-123');
      expect(result.message).toContain('high');
    });

    it('should handle empty results', async () => {
      const state = {
        intent: 'order_inquiry',
        toolResults: { data: { orders: [] } }
      };

      const result = await uiAgent.formatResponse(state);
      expect(result.formattedResponse).toContain('No orders');
    });
  });

  describe('stream_sse node', () => {
    it('should create valid SSE stream', async () => {
      const state = {
        formattedResponse: 'Processing your refund request...',
        chunks: ['Processing', ' your', ' refund', ' request', '...']
      };

      const stream = await uiAgent.streamSSE(state);
      expect(stream).toBeDefined();

      const reader = stream.getReader();
      const { done, value } = await reader.read();
      expect(done).toBe(false);
      expect(new TextDecoder().decode(value)).toContain('data:');
    });

    it('should handle rapid streaming', async () => {
      const state = {
        formattedResponse: 'Quick response',
        chunks: ['Quick', ' response', ' done']
      };

      const stream = await uiAgent.streamSSE(state);
      const chunks = [];

      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(new TextDecoder().decode(value));
      }

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should include event type in SSE', async () => {
      const state = {
        formattedResponse: 'Test message',
        chunks: ['Test message']
      };

      const stream = await uiAgent.streamSSE(state);
      const reader = stream.getReader();
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain('event:');
      expect(text).toContain('message');
    });
  });

  describe('update_chart node', () => {
    it('should generate order chart data', async () => {
      const state = {
        intent: 'order_inquiry',
        toolResults: {
          data: {
            orders: [
              { id: 1, orderDate: '2024-01-01', total: 100 },
              { id: 2, orderDate: '2024-01-02', total: 200 },
              { id: 3, orderDate: '2024-01-03', total: 150 }
            ]
          }
        }
      };

      const result = await uiAgent.updateChart(state);
      expect(result.chartData).toHaveProperty('orders');
      expect(result.chartData.orders).toHaveLength(3);
      expect(result.chartData).toHaveProperty('dailyVolume');
      expect(result.chartData).toHaveProperty('revenue');
    });

    it('should generate refund chart data', async () => {
      const state = {
        intent: 'refund_request',
        toolResults: {
          data: {
            refunds: [
              { id: 1, amount: 50, status: 'succeeded', date: '2024-01-01' },
              { id: 2, amount: 30, status: 'succeeded', date: '2024-01-02' }
            ]
          }
        }
      };

      const result = await uiAgent.updateChart(state);
      expect(result.chartData).toHaveProperty('refunds');
      expect(result.chartData.totalRefunded).toBe(80);
    });

    it('should handle empty chart data', async () => {
      const state = {
        intent: 'order_inquiry',
        toolResults: { data: { orders: [] } }
      };

      const result = await uiAgent.updateChart(state);
      expect(result.chartData.orders).toHaveLength(0);
      expect(result.chartData.dailyVolume).toBe(0);
    });
  });

  describe('SSE Stream Utilities', () => {
    it('should create SSE stream from async iterable', async () => {
      const data = ['Hello', ' World', '!'];
      const stream = createSSEStream(data);

      const reader = stream.getReader();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += new TextDecoder().decode(value);
      }

      expect(fullText).toContain('Hello');
      expect(fullText).toContain('World');
    });

    it('should format response with markdown', () => {
      const result = formatResponse('test', 'markdown');
      expect(result.type).toBe('markdown');
    });

    it('should format response with JSON', () => {
      const data = { key: 'value' };
      const result = formatResponse(data, 'json');
      expect(result.type).toBe('json');
    });
  });

  describe('graph compilation', () => {
    it('should compile default UI graph', () => {
      const graph = createDefaultUIGraph();
      expect(graph).toBeDefined();
      expect(typeof graph.invoke).toBe('function');
    });

    it('should have correct node structure', () => {
      const graph = createDefaultUIGraph();
      const nodes = graph.nodes;
      expect(nodes).toHaveProperty('format_response');
      expect(nodes).toHaveProperty('stream_sse');
      expect(nodes).toHaveProperty('update_chart');
    });
  });

  describe('error handling', () => {
    it('should handle invalid response type', async () => {
      const state = {
        intent: 'invalid_type',
        toolResults: { data: {} }
      };

      const result = await uiAgent.formatResponse(state);
      expect(result.error).toBeDefined();
    });

    it('should handle missing tool results', async () => {
      const state = {
        intent: 'refund_request',
        toolResults: null
      };

      const result = await uiAgent.formatResponse(state);
      expect(result.error).toBeDefined();
    });
  });

  describe('accessibility', () => {
    it('should include aria-labels in responses', async () => {
      const state = {
        intent: 'order_inquiry',
        toolResults: { data: { orders: [{ id: 1 }] } }
      };

      const result = await uiAgent.formatResponse(state);
      expect(result.accessibility).toHaveProperty('ariaLabel');
    });

    it('should include status for screen readers', async () => {
      const state = {
        intent: 'refund_request',
        toolResults: { data: { status: 'processing' } }
      };

      const result = await uiAgent.formatResponse(state);
      expect(result.accessibility).toHaveProperty('status');
      expect(result.accessibility.status).toContain('processing');
    });
  });
});
