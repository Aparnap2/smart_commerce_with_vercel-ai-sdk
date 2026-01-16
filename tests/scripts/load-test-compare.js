/**
 * Load Test Comparison: qwen2.5-coder vs granite3.1-moe
 * Benchmarks both models with identical prompts
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OUTPUT_DIR = resolve('./test-logs');
mkdirSync(OUTPUT_DIR, { recursive: true });

// Identical prompts for fair comparison
const BENCHMARK_PROMPTS = [
  { category: 'refund', text: 'I want to process a refund for order #12345. The product was damaged upon delivery.' },
  { category: 'order', text: 'Can you check the status of my order? Order number is 67890. Expected delivery was yesterday.' },
  { category: 'product', text: 'What laptop computers do you have available? I am looking for one with at least 16GB RAM.' },
  { category: 'support', text: 'I need to open a support ticket regarding a defective product I received last week.' },
  { category: 'general', text: 'Hello, I have a question about your return policy. How many days do I have to return items?' },
  { category: 'tracking', text: 'My package shows it was delivered but I did not receive it. Can you help me track it?' },
  { category: 'payment', text: 'What payment methods do you accept? Can I pay with PayPal or only credit cards?' },
  { category: 'warranty', text: 'Do your products come with a warranty? What is covered and how long does it last?' }
];

const MODELS = ['qwen2.5-coder:3b', 'granite3.1-moe:3b'];

async function ollamaRequest(endpoint, body) {
  const response = await fetch(`${OLLAMA_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return response.json();
}

async function runBenchmark(model) {
  console.log(`\n[BENCHMARK] ${model}`);
  console.log('='.repeat(60));

  const results = {
    model,
    tests: [],
    summary: {
      totalRequests: 0,
      successful: 0,
      failed: 0,
      totalDuration: 0,
      avgDuration: 0,
      minDuration: Infinity,
      maxDuration: 0,
      tokensPerSecond: 0
    }
  };

  for (const prompt of BENCHMARK_PROMPTS) {
    const start = Date.now();
    try {
      const result = await ollamaRequest('/api/chat', {
        model,
        messages: [{ role: 'user', content: prompt.text }],
        stream: false,
        options: { temperature: 0.7, num_predict: 512 }
      });
      const duration = Date.now() - start;

      const responseText = result.message?.content || '';
      const wordCount = responseText.split(/\s+/).length;
      const tokens = Math.ceil(wordCount * 1.3); // Rough estimate

      results.tests.push({
        category: prompt.category,
        prompt: prompt.text.substring(0, 50),
        duration,
        success: true,
        responseLength: responseText.length,
        tokens
      });

      results.summary.totalRequests++;
      results.summary.successful++;
      results.summary.totalDuration += duration;
      results.summary.minDuration = Math.min(results.summary.minDuration, duration);
      results.summary.maxDuration = Math.max(results.summary.maxDuration, duration);

      const tps = tokens / (duration / 1000);
      results.summary.tokensPerSecond += tps;

      console.log(`  ✓ ${prompt.category}: ${duration}ms | ${tokens} tokens | ${tps.toFixed(1)} t/s`);

    } catch (error) {
      results.tests.push({
        category: prompt.category,
        prompt: prompt.text.substring(0, 50),
        duration: Date.now() - start,
        success: false,
        error: error.message
      });

      results.summary.totalRequests++;
      results.summary.failed++;

      console.log(`  ✗ ${prompt.category}: FAILED - ${error.message}`);
    }
  }

  // Calculate averages
  if (results.summary.successful > 0) {
    results.summary.avgDuration = results.summary.totalDuration / results.summary.successful;
    results.summary.tokensPerSecond /= results.summary.successful;
  }

  return results;
}

async function runComparison() {
  console.log('========================================');
  console.log('Ollama Model Comparison');
  console.log('qwen2.5-coder:3b vs granite3.1-moe:3b');
  console.log('========================================\n');
  console.log(`Prompts: ${BENCHMARK_PROMPTS.length} test cases`);
  console.log(`Model 1: ${MODELS[0]}`);
  console.log(`Model 2: ${MODELS[1]}`);
  console.log('');

  const allResults = {
    timestamp: new Date().toISOString(),
    prompts: BENCHMARK_PROMPTS.length,
    models: {}
  };

  // Run benchmarks for both models
  for (const model of MODELS) {
    allResults.models[model] = await runBenchmark(model);
  }

  // Calculate comparison
  const comparison = {
    winner: null,
    metrics: {}
  };

  for (const metric of ['avgDuration', 'tokensPerSecond']) {
    const model1 = allResults.models[MODELS[0]].summary[metric];
    const model2 = allResults.models[MODELS[1]].summary[metric];

    comparison.metrics[metric] = {
      [MODELS[0]]: model1,
      [MODELS[1]]: model2,
      faster: model1 < model2 ? MODELS[0] : MODELS[1]
    };
  }

  // Determine overall winner
  const durationWinner = comparison.metrics.avgDuration.faster;
  const tpsWinner = comparison.metrics.tokensPerSecond.faster;

  if (durationWinner === tpsWinner) {
    comparison.winner = durationWinner;
  } else {
    comparison.winner = durationWinner; // Speed is more important
  }

  allResults.comparison = comparison;

  // Print comparison summary
  console.log('\n========================================');
  console.log('Comparison Summary');
  console.log('========================================\n');

  console.log('Average Response Time:');
  console.log(`  ${MODELS[0]}: ${comparison.metrics.avgDuration[MODELS[0]].toFixed(2)}ms`);
  console.log(`  ${MODELS[1]}: ${comparison.metrics.avgDuration[MODELS[1]].toFixed(2)}ms`);
  console.log(`  Winner: ${comparison.metrics.avgDuration.faster}\n`);

  console.log('Tokens Per Second:');
  console.log(`  ${MODELS[0]}: ${comparison.metrics.tokensPerSecond[MODELS[0]].toFixed(1)} t/s`);
  console.log(`  ${MODELS[1]}: ${comparison.metrics.tokensPerSecond[MODELS[1]].toFixed(1)} t/s`);
  console.log(`  Winner: ${comparison.metrics.tokensPerSecond.faster}\n`);

  console.log('='.repeat(60));
  console.log(`OVERALL WINNER: ${comparison.winner}`);
  console.log('='.repeat(60));

  // Save results
  const filepath = `${OUTPUT_DIR}/model-comparison-${Date.now()}.json`;
  writeFileSync(filepath, JSON.stringify(allResults, null, 2));
  console.log(`\nResults saved to: ${filepath}`);

  return allResults;
}

runComparison().catch(console.error);
