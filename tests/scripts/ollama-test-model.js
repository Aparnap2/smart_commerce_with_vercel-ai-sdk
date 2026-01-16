/**
 * Ollama Model Testing Script
 * Tests specific models for agent performance
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODELS = ['qwen2.5-coder:3b', 'granite3.1-moe:3b', 'nomic-embed-text:v1.5'];
const OUTPUT_DIR = resolve('./test-logs');

mkdirSync(OUTPUT_DIR, { recursive: true });

const testPrompts = {
  'refund_request': 'I want to refund my order #12345 because the product arrived damaged.',
  'order_inquiry': 'Where is my order? It was supposed to arrive yesterday.',
  'product_search': 'What wireless headphones do you have under $100?',
  'ticket_create': 'I need to open a support ticket for my defective product.',
  'general_support': 'Hello, thank you for your help.'
};

async function ollamaRequest(endpoint, body) {
  const response = await fetch(`${OLLAMA_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return response.json();
}

async function testModel(model, prompt) {
  const start = Date.now();
  try {
    const result = await ollamaRequest('/api/chat', {
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: { temperature: 0.7 }
    });
    const duration = Date.now() - start;

    return {
      model,
      prompt: prompt.substring(0, 50),
      duration,
      success: true,
      responseLength: result.message?.content?.length || 0
    };
  } catch (error) {
    return {
      model,
      prompt: prompt.substring(0, 50),
      duration: Date.now() - start,
      success: false,
      error: error.message
    };
  }
}

async function testEmbeddingModel(prompt) {
  const start = Date.now();
  try {
    const result = await ollamaRequest('/api/embeddings', {
      model: 'nomic-embed-text:v1.5',
      prompt
    });
    const duration = Date.now() - start;

    return {
      model: 'nomic-embed-text:v1.5',
      prompt: prompt.substring(0, 50),
      duration,
      success: true,
      dimensions: result.embedding?.length || 0
    };
  } catch (error) {
    return {
      model: 'nomic-embed-text:v1.5',
      prompt: prompt.substring(0, 50),
      duration: Date.now() - start,
      success: false,
      error: error.message
    };
  }
}

async function runTests() {
  console.log('========================================');
  console.log('Ollama Model Performance Tests');
  console.log('========================================\n');

  const results = {
    timestamp: new Date().toISOString(),
    models: {},
    summary: {
      totalTests: 0,
      passed: 0,
      failed: 0,
      avgDuration: 0
    }
  };

  // Test chat models
  for (const model of MODELS.filter(m => !m.includes('embed'))) {
    console.log(`\n[TESTING] ${model}`);
    console.log('-'.repeat(50));

    results.models[model] = {
      tests: [],
      avgDuration: 0
    };

    for (const [intent, prompt] of Object.entries(testPrompts)) {
      const result = await testModel(model, prompt);
      results.models[model].tests.push(result);
      results.summary.totalTests++;

      if (result.success) {
        results.summary.passed++;
        console.log(`  ✓ ${intent}: ${result.duration}ms (${result.responseLength} chars)`);
      } else {
        results.summary.failed++;
        console.log(`  ✗ ${intent}: FAILED - ${result.error}`);
      }
    }

    const durations = results.models[model].tests
      .filter(t => t.success)
      .map(t => t.duration);
    results.models[model].avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
  }

  // Test embedding model
  console.log(`\n[TESTING] nomic-embed-text:v1.5`);
  console.log('-'.repeat(50));

  results.models['nomic-embed-text:v1.5'] = {
    tests: [],
    avgDuration: 0
  };

  for (const prompt of Object.values(testPrompts)) {
    const result = await testEmbeddingModel(prompt);
    results.models['nomic-embed-text:v1.5'].tests.push(result);
    results.summary.totalTests++;

    if (result.success) {
      results.summary.passed++;
      console.log(`  ✓ Embed "${prompt.substring(0, 30)}...": ${result.duration}ms (${result.dimensions}d)`);
    } else {
      results.summary.failed++;
      console.log(`  ✗ Embed: FAILED - ${result.error}`);
    }
  }

  // Calculate overall average
  const allDurations = Object.values(results.models)
    .flatMap(m => m.tests.filter(t => t.success).map(t => t.duration));
  results.summary.avgDuration = allDurations.length > 0
    ? allDurations.reduce((a, b) => a + b, 0) / allDurations.length
    : 0;

  // Save results
  const filepath = `${OUTPUT_DIR}/ollama-test-results-${Date.now()}.json`;
  writeFileSync(filepath, JSON.stringify(results, null, 2));

  console.log('\n========================================');
  console.log('Summary');
  console.log('========================================');
  console.log(`Total Tests: ${results.summary.totalTests}`);
  console.log(`Passed: ${results.summary.passed}`);
  console.log(`Failed: ${results.summary.failed}`);
  console.log(`Avg Duration: ${results.summary.avgDuration.toFixed(2)}ms`);
  console.log(`\nResults saved to: ${filepath}`);

  return results;
}

runTests().catch(console.error);
