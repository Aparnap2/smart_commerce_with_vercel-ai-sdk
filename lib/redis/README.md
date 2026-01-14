# Redis Checkpointing for LangGraph

This module provides Redis-based state persistence for LangGraph workflows, enabling durable checkpoint storage with TTL support.

## Installation

```bash
pnpm install ioredis
```

## Environment Variables

Add the following to your `.env.local`:

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
REDIS_DB=0
REDIS_POOL_SIZE=10
REDIS_KEY_PREFIX=langgraph:
REDIS_USE_TLS=false

# Checkpointing
USE_REDIS=true
CHECKPOINT_TTL=86400  # 24 hours in seconds
```

## Quick Start

### Basic Usage

```typescript
import { createCheckpointSaver } from '@/lib/redis/index.js';
import { StateGraph, START, END } from '@langchain/langgraph';

// Create checkpoint saver (auto-selects Redis or Memory based on USE_REDIS)
const checkpointer = createCheckpointSaver();

// Define your state schema
interface ChatState {
  messages: Array<{ role: string; content: string }>;
  response: string;
}

// Create and compile graph with checkpointing
const workflow = new StateGraph<ChatState>({ /* ... */ });
const app = workflow.compile({ checkpointer });

// Invoke with thread_id for persistence
const result = await app.invoke(
  { messages: [{ role: 'user', content: 'Hello' }], response: '' },
  { configurable: { thread_id: 'my-thread-123' } }
);
```

### Direct Checkpoint Operations

```typescript
import { CheckpointManager, getRedisClient } from '@/lib/redis/index.js';

const manager = new CheckpointManager(getRedisClient());

// Save a checkpoint
await manager.saveCheckpoint(
  'thread-123',
  { id: 'cp-1', timestamp: Date.now() },
  { state: { messages: [] } },
  { source: 'input' },
  3600 // TTL in seconds
);

// Load latest checkpoint
const checkpoint = await manager.loadCheckpoint('thread-123');

// List all checkpoints
const checkpoints = await manager.listCheckpoints('thread-123', 10);

// Delete a checkpoint
await manager.deleteCheckpoint('thread-123', 'cp-1');

// Cleanup expired checkpoints
await manager.cleanupExpired('thread-123', 7 * 24 * 60 * 60 * 1000); // 7 days

// Delete entire thread
await manager.deleteThread('thread-123');
```

### Health Checks

```typescript
import { checkRedisHealth } from '@/lib/redis/index.js';

const health = await checkRedisHealth();
if (health.healthy) {
  console.log(`Redis latency: ${health.latency}ms`);
} else {
  console.error('Redis unavailable:', health.error);
}
```

## API Reference

### `createCheckpointSaver(useRedis?, namespace?, redisClient?)`

Factory function that creates the appropriate checkpoint saver.

- `useRedis`: Force Redis or memory mode
- `namespace`: Optional key prefix for isolation
- `redisClient`: Custom Redis client instance

Returns: `CheckpointSaver` (RedisCheckpointSaver or MemoryCheckpointSaver)

### `CheckpointManager`

Manages checkpoint lifecycle with TTL support.

#### Methods

| Method | Description |
|--------|-------------|
| `saveCheckpoint(threadId, checkpoint, state, metadata?, ttl?)` | Save a checkpoint |
| `loadCheckpoint(threadId, checkpointId?)` | Load a checkpoint |
| `listCheckpoints(threadId, limit?, before?)` | List checkpoints |
| `deleteCheckpoint(threadId, checkpointId)` | Delete a checkpoint |
| `cleanupExpired(threadId, maxAge)` | Remove stale checkpoints |
| `deleteThread(threadId)` | Delete all checkpoints for a thread |
| `extendTtl(threadId, additionalTtl)` | Extend TTL for all checkpoints |
| `getThreadMetadata(threadId)` | Get thread metadata |

### RedisCheckpointSaver

Implements LangGraph's `CheckpointSaver` interface.

```typescript
import { RedisCheckpointSaver } from '@/lib/redis/index.js';

const saver = new RedisCheckpointSaver(manager, ['namespace', 'prefix']);

// LangGraph CheckpointSaver interface
await saver.get(threadId, checkpointId);  // Get checkpoint
await saver.put(threadId, checkpoint, channels, newChannels, metadata, logs);  // Save
await saver.list(threadId, options);  // List
await saver.delete(threadId, checkpointId);  // Delete
```

## Architecture

```
lib/redis/
  client.ts           # Redis client with connection pooling
  checkpoint-manager.ts  # Checkpoint CRUD operations
  langgraph-checkpoint.ts # LangGraph CheckpointSaver interface
  index.ts            # Module exports
  logger.ts           # Structured logging
  examples/
    checkpoint-example.ts  # Usage examples
```

## Key Features

- **Connection Pooling**: ioredis with configurable pool size
- **Retry Logic**: Exponential backoff for transient failures
- **TTL Management**: Automatic expiration of stale checkpoints
- **Namespace Isolation**: Key prefixing for multi-tenant support
- **Memory Fallback**: Development mode with in-memory storage
- **Structured Logging**: JSON-formatted logs with configurable levels

## Production Considerations

1. **Redis Connection**: Use TLS in production (`REDIS_USE_TLS=true`)
2. **TTL Settings**: Adjust `CHECKPOINT_TTL` based on session duration
3. **Memory Fallback**: MemorySaver loses data on restart - use for development only
4. **Monitoring**: Enable health checks in production monitoring
5. **Cleanup**: Run `cleanupExpired` periodically via cron or scheduler

## Example API Route

See `app/api/chat/langgraph/route.ts` for a complete example with:
- Health check endpoint (`GET /?action=health`)
- List checkpoints (`GET /?action=list&threadId=xxx`)
- Chat workflow with persistence (`POST /`)
- Thread deletion (`DELETE /?threadId=xxx`)
