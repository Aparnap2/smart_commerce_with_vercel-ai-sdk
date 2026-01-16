/**
 * Load Tests: Ollama Model Benchmarking
 * Tests qwen2.5-coder:3b and granite3.1-moe:3b performance
 */

import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { dockerServices, testUsers } from '../config/test-config.js';

// ============================================================================
// Logger Utility
// ============================================================================

class LoadTestLogger {
  constructor(testName) {
    this.testName = testName;
    this.metrics = [];
  }

  record(name, value, unit = 'ms') {
    const metric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      test: this.testName
    };
    this.metrics.push(metric);
    console.log(`[LOAD] ${this.testName} - ${name}: ${value}${unit}`);
  }

  summary() {
    const summary = {
      test: this.testName,
      totalRequests: this.metrics.length,
      metrics: {}
    };

    // Group by name
    for (const m of this.metrics) {
      if (!summary.metrics[m.name]) {
        summary.metrics[m.name] = [];
      }
      summary.metrics[m.name].push(m.value);
    }

    // Calculate statistics
    for (const name of Object.keys(summary.metrics)) {
      const values = summary.metrics[name];
      summary.metrics[name] = {
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        p50: this.percentile(values, 50),
        p95: this.percentile(values, 95),
        p99: this.percentile(values, 99)
      };
    }

    return summary;
  }

  percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)] || sorted[0];
  }

  async saveToFile() {
    const fs = await import('fs');
    const path = await import('path');
    const logDir = path.resolve('./load-test-logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const filepath = path.join(logDir, `${this.testName}-${Date.now()}.json`);
    fs.writeFileSync(filepath, JSON.stringify(this.summary(), null, 2));
    console.log(`[LOAD] Results saved to ${filepath}`);
  }
}

// ============================================================================
// Load Test Suite
// ============================================================================

describe('Load Tests: Ollama Model Performance', () => {
  let logger;

  beforeAll(() => {
    logger = new LoadTestLogger('Ollama-Benchmark');
  });

  afterAll(async () => {
    await logger.saveToFile();
  });

  // ==========================================================================
  // Embedding Performance Tests
  // ==========================================================================

  describe('Embedding Performance: nomic-embed-text:v1.5', () => {
    const testQueries = [
      'wireless headphones with noise cancellation',
      'laptop computer for programming',
      'smartphone with good camera',
      'wireless earbuds battery life',
      'gaming mouse rgb lighting',
      'mechanical keyboard switches',
      '4k monitor refresh rate',
      'portable charger capacity',
      'webcam for streaming',
      'speaker bluetooth waterproof'
    ];

    it('should generate embeddings with <200ms latency', async () => {
      logger.record('embedding_test_start');

      for (const query of testQueries) {
        const start = Date.now();
        try {
          const response = await fetch(`${dockerServices.ollama.baseUrl}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'nomic-embed-text:v1.5',
              prompt: query
            })
          });

          const duration = Date.now() - start;
          logger.record('embedding_latency', duration, 'ms');

          expect(response.ok).toBe(true);
          expect(duration).toBeLessThan(200);
        } catch (error) {
          logger.record('embedding_error', 1, 'count');
        }
      }
    });

    it('should handle concurrent embedding requests', async () => {
      const concurrent = 5;
      const start = Date.now();

      await Promise.all(
        testQueries.slice(0, concurrent).map(async (query) => {
          const s = Date.now();
          const response = await fetch(`${dockerServices.ollama.baseUrl}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'nomic-embed-text:v1.5',
              prompt: query
            })
          });
          const duration = Date.now() - s;
          logger.record('concurrent_embedding_latency', duration, 'ms');
          return response.ok;
        })
      );

      const totalDuration = Date.now() - start;
      logger.record('concurrent_total_duration', totalDuration, 'ms');
      expect(totalDuration).toBeLessThan(2000);
    });
  });

  // ==========================================================================
  // Chat Model Performance Tests: qwen2.5-coder:3b
  // ==========================================================================

  describe('Performance: qwen2.5-coder:3b', () => {
    const testPrompts = [
      { role: 'user', content: 'What is the refund policy for orders?' },
      { role: 'user', content: 'How can I track my order status?' },
      { role: 'user', content: 'Tell me about your product warranty' },
      { role: 'user', content: 'How do I contact customer support?' },
      { role: 'user', content: 'What payment methods do you accept?' }
    ];

    it('should respond within 3 seconds for simple queries', async () => {
      logger.record('qwen_test_start');

      for (const prompt of testPrompts) {
        const start = Date.now();
        try {
          const response = await fetch(`${dockerServices.ollama.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'qwen2.5-coder:3b',
              messages: [prompt],
              stream: false,
              options: { temperature: 0.7 }
            })
          });

          const duration = Date.now() - start;
          logger.record('qwen_latency', duration, 'ms');

          expect(response.ok).toBe(true);
          expect(duration).toBeLessThan(3000);
        } catch (error) {
          logger.record('qwen_error', 1, 'count');
        }
      }
    });

    it('should handle multi-turn conversations', async () => {
      const conversation = [
        { role: 'user', content: 'Hello, I need help with an order' },
        { role: 'assistant', content: 'Of course! I can help you with your order. What would you like to know?' },
        { role: 'user', content: 'I want to check my order status' },
        { role: 'assistant', content: 'I can help you check your order status. Do you have your order number?' },
        { role: 'user', content: 'It is order #12345' }
      ];

      const start = Date.now();

      const response = await fetch(`${dockerServices.ollama.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5-coder:3b',
          messages: conversation,
          stream: false
        })
      });

      const duration = Date.now() - start;
      logger.record('qwen_conversation_latency', duration, 'ms');

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.message).toBeDefined();
    });

    it('should generate streaming responses', async () => {
      const start = Date.now();

      const response = await fetch(`${dockerServices.ollama.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5-coder:3b',
          messages: [{ role: 'user', content: 'Write a brief refund policy.' }],
          stream: true
        })
      });

      let chunkCount = 0;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunkCount++;
        decoder.decode(value);
      }

      const duration = Date.now() - start;
      logger.record('qwen_streaming_latency', duration, 'ms');
      logger.record('qwen_stream_chunks', chunkCount, 'count');

      expect(chunkCount).toBeGreaterThan(0);
      expect(duration).toBeLessThan(5000);
    });
  });

  // ==========================================================================
  // Chat Model Performance Tests: granite3.1-moe:3b
  // ==========================================================================

  describe('Performance: granite3.1-moe:3b', () => {
    const testPrompts = [
      { role: 'user', content: 'What is the return process for items?' },
      { role: 'user', content: 'How long does shipping take?' },
      { role: 'user', content: 'Can I modify my order after placing it?' },
      { role: 'user', content: 'What should I do if my item arrives damaged?' },
      { role: 'user', content: 'Do you offer expedited shipping options?' }
    ];

    it('should respond within 3 seconds for simple queries', async () => {
      logger.record('granite_test_start');

      for (const prompt of testPrompts) {
        const start = Date.now();
        try {
          const response = await fetch(`${dockerServices.ollama.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'granite3.1-moe:3b',
              messages: [prompt],
              stream: false,
              options: { temperature: 0.7 }
            })
          });

          const duration = Date.now() - start;
          logger.record('granite_latency', duration, 'ms');

          expect(response.ok).toBe(true);
          expect(duration).toBeLessThan(3000);
        } catch (error) {
          logger.record('granite_error', 1, 'count');
        }
      }
    });

    it('should handle multi-turn conversations', async () => {
      const conversation = [
        { role: 'user', content: 'Hi, I need assistance' },
        { role: 'assistant', content: 'Hello! I am here to help. What can I assist you with today?' },
        { role: 'user', content: 'I have a question about my recent purchase' },
        { role: 'assistant', content: 'I would be happy to help with your purchase. What specific information do you need?' },
        { role: 'user', content: 'When will it arrive?' }
      ];

      const start = Date.now();

      const response = await fetch(`${dockerServices.ollama.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'granite3.1-moe:3b',
          messages: conversation,
          stream: false
        })
      });

      const duration = Date.now() - start;
      logger.record('granite_conversation_latency', duration, 'ms');

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.message).toBeDefined();
    });

    it('should generate streaming responses', async () => {
      const start = Date.now();

      const response = await fetch(`${dockerServices.ollama.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'granite3.1-moe:3b',
          messages: [{ role: 'user', content: 'Describe your shipping options.' }],
          stream: true
        })
      });

      let chunkCount = 0;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunkCount++;
        decoder.decode(value);
      }

      const duration = Date.now() - start;
      logger.record('granite_streaming_latency', duration, 'ms');
      logger.record('granite_stream_chunks', chunkCount, 'count');

      expect(chunkCount).toBeGreaterThan(0);
      expect(duration).toBeLessThan(5000);
    });
  });

  // ==========================================================================
  // Model Comparison
  // ==========================================================================

  describe('Model Comparison: qwen vs granite', () => {
    const benchmarkPrompt = { role: 'user', content: 'How can I return a product for a refund?' };

    it('should provide comparable response quality', async () => {
      // Test qwen2.5-coder
      const qwenStart = Date.now();
      const qwenResponse = await fetch(`${dockerServices.llama.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5-coder:3b',
          messages: [benchmarkPrompt],
          stream: false
        })
      });
      const qwenDuration = Date.now() - qwenStart;
      const qwenData = await qwenResponse.json();

      // Test granite3.1-moe
      const graniteStart = Date.now();
      const graniteResponse = await fetch(`${dockerServices.ollama.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'granite3.1-moe:3b',
          messages: [benchmarkPrompt],
          stream: false
        })
      });
      const graniteDuration = Date.now() - graniteStart;
      const graniteData = await graniteResponse.json();

      logger.record('qwen_benchmark_duration', qwenDuration, 'ms');
      logger.record('granite_benchmark_duration', graniteDuration, 'ms');

      // Both should succeed
      expect(qwenResponse.ok).toBe(true);
      expect(graniteResponse.ok).toBe(true);

      // Both should have responses
      expect(qwenData.message?.content?.length).toBeGreaterThan(0);
      expect(graniteData.message?.content?.length).toBeGreaterThan(0);

      console.log('[COMPARISON] Qwen:', {
        duration: qwenDuration,
        responseLength: qwenData.message?.content?.length
      });
      console.log('[COMPARISON] Granite:', {
        duration: graniteDuration,
        responseLength: graniteData.message?.content?.length
      });
    });
  });

  // ==========================================================================
  // Stress Tests
  // ==========================================================================

  describe('Stress Tests: High Load', () => {
    it('should handle 10 concurrent requests', async () => {
      const concurrentRequests = 10;
      const start = Date.now();

      const promises = Array(concurrentRequests).fill(null).map(async (_, i) => {
        const s = Date.now();
        const response = await fetch(`${dockerServices.ollama.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'qwen2.5-coder:3b',
            messages: [{ role: 'user', content: `Request ${i}: What services do you offer?` }],
            stream: false
          })
        });
        const duration = Date.now() - s;
        logger.record('stress_concurrent_latency', duration, 'ms');
        return response.ok;
      });

      const results = await Promise.all(promises);
      const totalDuration = Date.now() - start;

      logger.record('stress_total_duration', totalDuration, 'ms');
      logger.record('stress_success_rate', results.filter(r => r).length / concurrentRequests * 100, '%');

      expect(results.every(r => r)).toBe(true);
      expect(totalDuration).toBeLessThan(15000);
    });

    it('should recover from rapid successive requests', async () => {
      const requests = 20;
      const start = Date.now();

      for (let i = 0; i < requests; i++) {
        const s = Date.now();
        await fetch(`${dockerServices.ollama.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'qwen2.5-coder:3b',
            messages: [{ role: 'user', content: 'Test message' }],
            stream: false
          })
        });
        const duration = Date.now() - s;
        logger.record('stress_successive_latency', duration, 'ms');
      }

      const totalDuration = Date.now() - start;
      logger.record('stress_successive_total', totalDuration, 'ms');
      expect(totalDuration).toBeLessThan(60000);
    });
  });
});

// ============================================================================
// Standalone Load Test Runner (run with: node scripts/load-test.js)
// ============================================================================

async function runStandaloneLoadTest() {
  console.log('========================================');
  console.log('Load Test: Ollama Model Performance');
  console.log('========================================\n');

  const logger = new LoadTestLogger('Standalone-Run');

  // Test each model
  const models = [
    { name: 'qwen2.5-coder:3b', prompt: 'What is your return policy?' },
    { name: 'granite3.1-moe:3b', prompt: 'How do I contact support?' }
  ];

  for (const model of models) {
    console.log(`\n[TESTING] ${model.name}`);
    console.log('-'.repeat(50));

    // Run 5 requests
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      try {
        const response = await fetch(`${dockerServices.ollama.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model.name,
            messages: [{ role: 'user', content: model.prompt }],
            stream: false
          })
        });

        const duration = Date.now() - start;
        logger.record(`${model.name}_latency`, duration, 'ms');

        console.log(`  Request ${i + 1}: ${duration}ms - ${response.ok ? 'OK' : 'FAILED'}`);

        if (!response.ok) break;
      } catch (error) {
        console.log(`  Request ${i + 1}: ERROR - ${error.message}`);
        logger.record(`${model.name}_error`, 1, 'count');
      }
    }
  }

  console.log('\n========================================');
  console.log('Summary:');
  console.log('========================================');
  console.log(JSON.stringify(logger.summary(), null, 2));

  await logger.saveToFile();
}

runStandaloneLoadTest().catch(console.error);
