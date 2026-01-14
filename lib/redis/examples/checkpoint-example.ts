/**
 * Redis Checkpointing Usage Examples
 * Comprehensive examples demonstrating all checkpoint management operations
 */

import {
  CheckpointManager,
  createCheckpointSaver,
  checkRedisHealth,
  RedisCheckpointSaver,
  MemoryCheckpointSaver,
  logger,
} from '../index.js';
import { getRedisClient } from '../client.js';
import type { Checkpoint, CheckpointSaver } from '@langchain/langgraph';

/**
 * Example 1: Basic Checkpoint Operations
 * Demonstrates save, load, list, and delete operations
 */
export async function exampleBasicOperations(): Promise<void> {
  console.log('\n=== Example 1: Basic Checkpoint Operations ===\n');

  // Create checkpoint manager
  const manager = new CheckpointManager(getRedisClient());

  const threadId = 'user-session-123';
  const threadId2 = 'user-session-456';

  // Save checkpoints
  const checkpoint1 = { id: 'cp-1', timestamp: Date.now() };
  const state1 = { messages: ['Hello'], context: 'initial' };

  const checkpoint2 = { id: 'cp-2', timestamp: Date.now() + 1000 };
  const state2 = { messages: ['Hello', 'How are you?'], context: 'follow-up' };

  await manager.saveCheckpoint(threadId, checkpoint1, state1, { source: 'user' });
  await manager.saveCheckpoint(threadId, checkpoint2, state2, { source: 'user' }, 3600); // 1 hour TTL

  console.log('Saved checkpoints for thread:', threadId);

  // Load latest checkpoint
  const loaded = await manager.loadCheckpoint(threadId);
  console.log('Latest checkpoint:', loaded);

  // Load specific checkpoint
  const loaded2 = await manager.loadCheckpoint(threadId, 'cp-1');
  console.log('Specific checkpoint (cp-1):', loaded2);

  // List all checkpoints
  const checkpoints = await manager.listCheckpoints(threadId);
  console.log('All checkpoints:', checkpoints);

  // Get thread metadata
  const metadata = await manager.getThreadMetadata(threadId);
  console.log('Thread metadata:', metadata);
}

/**
 * Example 2: LangGraph Integration
 * Demonstrates using RedisCheckpointSaver with LangGraph workflows
 */
export async function exampleLangGraphIntegration(): Promise<void> {
  console.log('\n=== Example 2: LangGraph Integration ===\n');

  // Create the appropriate checkpoint saver based on environment
  const checkpointSaver: CheckpointSaver = createCheckpointSaver(
    process.env.USE_REDIS === 'true',
    ['myapp', 'workflows']
  );

  console.log('Checkpoint saver type:', checkpointSaver.constructor.name);

  // Example: Using with LangGraph workflow
  /*
  import { StateGraph, START, END } from '@langchain/langgraph';

  interface WorkflowState {
    input: string;
    output: string;
    step: number;
  }

  function processNode(state: WorkflowState): WorkflowState {
    return { ...state, output: `Processed: ${state.input}`, step: state.step + 1 };
  }

  const workflow = new StateGraph<WorkflowState>({
    channels: {
      input: { default: () => '' },
      output: { default: () => '' },
      step: { default: () => 0 },
    },
  });

  workflow.addNode('process', processNode);
  workflow.addEdge(START, 'process');
  workflow.addEdge('process', END);

  const app = workflow.compile({
    checkpointer: checkpointSaver,
  });

  // Invoke with thread_id for persistence
  const result = await app.invoke(
    { input: 'test', output: '', step: 0 },
    { configurable: { thread_id: 'my-thread-123' } }
  );
  */
}

/**
 * Example 3: Checkpoint Cleanup
 * Demonstrates cleanup operations for expired checkpoints
 */
export async function exampleCleanupOperations(): Promise<void> {
  console.log('\n=== Example 3: Cleanup Operations ===\n');

  const manager = new CheckpointManager(getRedisClient());
  const threadId = 'cleanup-demo-thread';

  // Create some checkpoints
  for (let i = 0; i < 5; i++) {
    await manager.saveCheckpoint(
      threadId,
      { id: `old-cp-${i}`, timestamp: Date.now() - i * 86400000 },
      { step: i }
    );
  }

  // Clean up checkpoints older than 2 days
  const cleaned = await manager.cleanupExpired(threadId, 2 * 24 * 60 * 60 * 1000);
  console.log(`Cleaned up ${cleaned} expired checkpoints`);

  // Get remaining checkpoints
  const remaining = await manager.listCheckpoints(threadId);
  console.log(`Remaining checkpoints: ${remaining.length}`);

  // Delete entire thread
  await manager.deleteThread(threadId);
  console.log('Thread deleted');
}

/**
 * Example 4: TTL Management
 * Demonstrates extending checkpoint TTLs
 */
export async function exampleTtlManagement(): Promise<void> {
  console.log('\n=== Example 4: TTL Management ===\n');

  const manager = new CheckpointManager(getRedisClient());
  const threadId = 'ttl-demo-thread';

  // Create checkpoint with short TTL
  await manager.saveCheckpoint(
    threadId,
    { id: 'short-ttl', timestamp: Date.now() },
    { data: 'temporary' },
    undefined,
    300 // 5 minutes
  );

  // Extend TTL for all checkpoints in thread
  const extended = await manager.extendTtl(threadId, 86400); // 24 hours
  console.log(`Extended TTL for ${extended} checkpoints`);

  // Get thread metadata to see TTL info
  const metadata = await manager.getThreadMetadata(threadId);
  console.log('Thread metadata:', metadata);
}

/**
 * Example 5: Health Check and Monitoring
 * Demonstrates health checks and monitoring
 */
export async function exampleHealthChecks(): Promise<void> {
  console.log('\n=== Example 5: Health Checks ===\n');

  // Check Redis health
  const health = await checkRedisHealth();
  console.log('Redis health:', health);

  if (health.healthy) {
    console.log(`Redis latency: ${health.latency}ms`);
  } else {
    console.error('Redis unavailable:', health.error);
  }

  // Check if Redis is available for use
  const isAvailable = process.env.USE_REDIS === 'true';
  console.log(`Redis available for checkpointing: ${isAvailable}`);
}

/**
 * Example 6: Fallback to Memory Saver
 * Demonstrates automatic fallback when Redis is unavailable
 */
export async function exampleFallbackBehavior(): Promise<void> {
  console.log('\n=== Example 6: Fallback Behavior ===\n');

  // This will automatically use MemoryCheckpointSaver if USE_REDIS is not 'true'
  const checkpointSaver = createCheckpointSaver();

  console.log('Using checkpoint saver:', checkpointSaver.constructor.name);

  if (checkpointSaver instanceof MemoryCheckpointSaver) {
    console.log('Running in development mode with in-memory storage');
    console.log('Note: Checkpoints will be lost on restart');

    // Memory saver operations
    /*
    await checkpointSaver.put('thread-1', checkpoint, channels, newChannels, metadata);
    const loaded = await checkpointSaver.get('thread-1');
    */
  } else if (checkpointSaver instanceof RedisCheckpointSaver) {
    console.log('Running in production mode with Redis storage');
    console.log('Checkpoints are persisted and durable');
  }
}

/**
 * Example 7: Batch Operations
 * Demonstrates batch checkpoint operations
 */
export async function exampleBatchOperations(): Promise<void> {
  console.log('\n=== Example 7: Batch Operations ===\n');

  const manager = new CheckpointManager(getRedisClient());
  const threadId = 'batch-demo-thread';

  // Create multiple checkpoints in parallel
  const batchSize = 10;
  const promises = Array.from({ length: batchSize }, (_, i) =>
    manager.saveCheckpoint(
      threadId,
      { id: `batch-cp-${i}`, timestamp: Date.now() + i * 1000 },
      { step: i, data: `batch-data-${i}` },
      { batch: true }
    )
  );

  await Promise.all(promises);
  console.log(`Created ${batchSize} checkpoints in parallel`);

  // List all checkpoints
  const checkpoints = await manager.listCheckpoints(threadId, 100);
  console.log(`Total checkpoints: ${checkpoints.length}`);

  // Delete all checkpoints
  await manager.deleteThread(threadId);
  console.log('Batch thread deleted');
}

/**
 * Main execution function
 */
export async function runAllExamples(): Promise<void> {
  console.log('Starting Redis Checkpoint Examples\n');
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Redis configured:', process.env.USE_REDIS === 'true');

  try {
    await exampleHealthChecks();
    await exampleBasicOperations();
    await exampleLangGraphIntegration();
    await exampleCleanupOperations();
    await exampleTtlManagement();
    await exampleFallbackBehavior();
    await exampleBatchOperations();

    console.log('\n=== All Examples Complete ===\n');
  } catch (error) {
    console.error('Example execution failed:', error);
    throw error;
  }
}

// Run examples if this file is executed directly
if (process.argv[1]?.endsWith('checkpoint-example.ts')) {
  runAllExamples().catch(console.error);
}
