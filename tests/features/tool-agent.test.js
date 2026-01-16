/**
 * Feature Tests: ToolAgent
 * Tests database queries, SerpAPI, and hybrid search
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { createToolAgent, createDefaultToolGraph } from '../../lib/agents/tool.js';
import { hybridSearch, routeQuery } from '../../lib/search/hybrid.js';
import { dockerServices } from '../config/test-config.js';

describe('ToolAgent', () => {
  let toolAgent;

  beforeAll(async () => {
    toolAgent = createToolAgent({
      userId: 'test-user-001',
      userEmail: 'testcustomer@example.com'
    });
  });

  describe('db_query node', () => {
    it('should query customer data', async () => {
      const state = {
        queryType: 'customer',
        identifiers: { email: 'testcustomer@example.com' }
      };

      const result = await toolAgent.executeDbQuery(state);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('type', 'customer');
      expect(result.summary).toContain('customer');
    });

    it('should query product data', async () => {
      const state = {
        queryType: 'product',
        identifiers: { productId: 1 }
      };

      const result = await toolAgent.executeDbQuery(state);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('type', 'product');
    });

    it('should query order data', async () => {
      const state = {
        queryType: 'order',
        identifiers: { email: 'testcustomer@example.com' }
      };

      const result = await toolAgent.executeDbQuery(state);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('type', 'order');
    });

    it('should query support tickets', async () => {
      const state = {
        queryType: 'ticket',
        identifiers: { email: 'testcustomer@example.com' }
      };

      const result = await toolAgent.executeDbQuery(state);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('type', 'ticket');
    });

    it('should handle invalid query type', async () => {
      const state = {
        queryType: 'invalid',
        identifiers: {}
      };

      const result = await toolAgent.executeDbQuery(state);
      expect(result.error).toBeDefined();
    });

    it('should enforce data isolation by email', async () => {
      const state = {
        queryType: 'customer',
        identifiers: { email: 'other@example.com' }
      };

      const result = await toolAgent.executeDbQuery(state);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('Access Denied');
    });
  });

  describe('serp_search node', () => {
    it('should perform product search', async () => {
      const state = {
        searchType: 'product',
        query: 'wireless headphones with noise cancellation'
      };

      const result = await toolAgent.executeSerpSearch(state);
      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should handle empty search results', async () => {
      const state = {
        searchType: 'product',
        query: 'xyznonexistentproduct12345'
      };

      const result = await toolAgent.executeSerpSearch(state);
      expect(result.results).toHaveLength(0);
    });

    it('should limit results to 5', async () => {
      const state = {
        searchType: 'product',
        query: 'laptop smartphone tablet smartwatch'
      };

      const result = await toolAgent.executeSerpSearch(state);
      expect(result.results.length).toBeLessThanOrEqual(5);
    });
  });

  describe('vector_search node', () => {
    it('should search similar embeddings', async () => {
      const state = {
        query: 'affordable wireless earbuds',
        userId: 'test-user-001',
        contextType: 'product_search'
      };

      const result = await toolAgent.executeVectorSearch(state);
      expect(result).toHaveProperty('similarEmbeddings');
      expect(result).toHaveProperty('scores');
      expect(Array.isArray(result.similarEmbeddings)).toBe(true);
    });

    it('should return empty for no matches', async () => {
      const state = {
        query: 'zzzznonexistentquerythatwillnotmatch',
        userId: 'test-user-001',
        contextType: 'product_search'
      };

      const result = await toolAgent.executeVectorSearch(state);
      expect(result.similarEmbeddings).toHaveLength(0);
    });
  });

  describe('combine_results node', () => {
    it('should merge database and search results', async () => {
      const state = {
        dbResults: { data: [{ id: 1, name: 'Product 1' }] },
        searchResults: { results: [{ title: 'Online Review 1' }] },
        vectorResults: { similarEmbeddings: [] }
      };

      const result = await toolAgent.combineResults(state);
      expect(result).toHaveProperty('mergedData');
      expect(result).toHaveProperty('confidence');
    });

    it('should handle empty results gracefully', async () => {
      const state = {
        dbResults: null,
        searchResults: { results: [] },
        vectorResults: { similarEmbeddings: [] }
      };

      const result = await toolAgent.combineResults(state);
      expect(result.mergedData).toBeDefined();
    });
  });

  describe('Hybrid Search', () => {
    it('should route queries correctly', () => {
      expect(routeQuery('Show me laptops', 'product_search')).toBe('hybrid');
      expect(routeQuery('Order status for #123', 'order_inquiry')).toBe('db');
      expect(routeQuery('What headphones are good?', 'recommendation')).toBe('vector');
    });

    it('should perform hybrid search', async () => {
      const result = await hybridSearch({
        query: 'wireless headphones',
        userId: 'test-user-001',
        context: 'product_search',
        vectorWeight: 0.6,
        bm25Weight: 0.4
      });

      expect(result).toHaveProperty('products');
      expect(result).toHaveProperty('semantic');
      expect(result).toHaveProperty('merged');
    });

    it('should fall back to BM25 for exact matches', async () => {
      const result = await hybridSearch({
        query: 'Smartphone X Pro',
        userId: 'test-user-001',
        context: 'product_search',
        vectorWeight: 0.3,
        bm25Weight: 0.7
      });

      expect(result.bm25Score).toBeGreaterThan(0);
    });
  });

  describe('graph compilation', () => {
    it('should compile default tool graph', () => {
      const graph = createDefaultToolGraph();
      expect(graph).toBeDefined();
      expect(typeof graph.invoke).toBe('function');
    });

    it('should have correct node structure', () => {
      const graph = createDefaultToolGraph();
      const nodes = graph.nodes;
      expect(nodes).toHaveProperty('db_query');
      expect(nodes).toHaveProperty('serp_search');
      expect(nodes).toHaveProperty('vector_search');
      expect(nodes).toHaveProperty('combine_results');
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors', async () => {
      const state = {
        queryType: 'customer',
        identifiers: { email: 'test@example.com' },
        connectionError: true
      };

      const result = await toolAgent.executeDbQuery(state);
      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('CONNECTION_ERROR');
    });

    it('should handle SerpAPI quota exceeded', async () => {
      const state = {
        searchType: 'product',
        query: 'test',
        quotaExceeded: true
      };

      const result = await toolAgent.executeSerpSearch(state);
      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('QUOTA_EXCEEDED');
    });
  });
});
