# E-Commerce Support Agent - Comprehensive Transformation Plan

## Executive Summary

Transform the existing Vercel AI SDK e-commerce chatbot into a **hierarchical LangGraph multi-agent system** with:
- **Supervisor Agent** → routes queries to specialized agents
- **RefundAgent** → handles Stripe refunds with idempotency
- **ToolAgent** → executes database operations and SerpAPI lookups
- **UIAgent** → manages frontend streaming and visualization updates

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Query (SSE Stream)                       │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Next.js API Route (/api/agent)                      │
│              - Auth middleware (Supabase)                        │
│              - SSE streaming                                     │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              FastAPI Backend (/invoke endpoint)                  │
│              - Redis checkpointing                               │
│              - Rate limiting                                     │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              LangGraph Supervisor (StateGraph)                   │
│              State: {messages, intent, context, user_prefs}      │
└────────┬────────────────┬────────────────┬──────────────────────┘
         │                │                │
         ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ RefundAgent  │  │ ToolAgent    │  │ UIAgent      │
│ - Stripe API │  │ - Prisma DB  │  │ - SSE output │
│ - Idempotent │  │ - SerpAPI    │  │ - Recharts   │
│ - Validation │  │ - pgvector   │  │ - UI updates │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       └─────────────────┼─────────────────┘
                         ▼
              ┌─────────────────────┐
              │  Critic/Reflect     │
              │  - Validate output  │
              │  - Check policy     │
              │  - Quality gate     │
              └─────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  Redis Checkpoint   │
              │  - Session state    │
              │  - Conversation     │
              └─────────────────────┘
```

## Detailed Implementation Plan

### Phase 1: Infrastructure Setup

#### 1.1 Supabase Integration
- **Goal**: Replace PostgreSQL with Supabase for auth + pgvector
- **Changes**:
  - Add `@supabase/supabase-js` client
  - Enable pgvector extension
  - Create `user_embeddings` table for preference history
  - Create RLS policies for data isolation

#### 1.2 Redis Checkpointing
- **Goal**: Persist LangGraph state across requests
- **Changes**:
  - Add `ioredis` for Redis client
  - Configure `MemorySaver` for local dev
  - Configure `RedisSaver` for production

### Phase 2: LangGraph Architecture

#### 2.1 State Definition
```typescript
interface AgentState {
  messages: Array<HumanMessage | AIMessage | ToolMessage>;
  intent: IntentType;
  context: QueryContext;
  user_preferences: UserEmbedding;
  tool_results: Array<ToolResult>;
  reflection: ReflectionResult;
  metadata: {
    thread_id: string;
    user_id: string;
    timestamp: number;
  };
}

type IntentType =
  | 'refund_request'
  | 'order_inquiry'
  | 'product_search'
  | 'ticket_create'
  | 'general_support';
```

#### 2.2 Supervisor Agent
- **Node**: `classify_query`
- **Input**: User message + conversation history
- **Output**: Intent classification with confidence
- **LLM**: Gemini 2.0 Flash (fast, cost-effective)

#### 2.3 RefundAgent
- **Nodes**: `initiate_refund` → `validate_refund` → `execute_refund`
- **Stripe Integration**:
  - Use idempotency keys: `stripe_idempotency_key: ${order_id}-${timestamp}`
  - Webhook handler with signature verification
  - Fallback to database status check

#### 2.4 ToolAgent
- **Nodes**: `db_query` → `serp_search` → `vector_search`
- **Hybrid Search**:
  - pgvector for semantic search (user preferences)
  - BM25 fallback for exact matches (products, orders)
  - Query routing based on intent

#### 2.5 UIAgent
- **Nodes**: `format_response` → `stream_sse` → `update_chart`
- **Responsibilities**:
  - Format markdown responses
  - Stream partial updates via SSE
  - Trigger frontend chart updates (Recharts)

### Phase 3: Frontend Dashboard

#### 3.1 New Routes
- `/dashboard` - Main support dashboard
- `/dashboard/orders` - Order visualization
- `/dashboard/tickets` - Ticket management
- `/dashboard/analytics` - Recharts analytics

#### 3.2 Components
- `ChatWidget` - Enhanced from existing
- `OrderChart` - Recharts order trends
- `RefundStatus` - Stripe refund tracking
- `TicketList` - Support ticket display

### Phase 4: API Routes

#### 4.1 `/api/agent` (NEW)
- POST: Main agent endpoint
- SSE streaming response
- Auth: Supabase session validation

#### 4.2 `/api/refunds/webhook` (NEW)
- Stripe webhook handler
- Idempotency validation
- Status sync to database

## File Changes Summary

| File | Action | Purpose |
|------|--------|---------|
| `lib/supabase/client.ts` | CREATE | Supabase client with auth |
| `lib/redis/checkpointer.ts` | CREATE | Redis checkpoint saver |
| `lib/agents/state.ts` | CREATE | Agent state definitions |
| `lib/agents/supervisor.ts` | CREATE | Supervisor agent logic |
| `lib/agents/refund.ts` | CREATE | Refund agent with Stripe |
| `lib/agents/tool.ts` | CREATE | Tool agent with hybrid search |
| `lib/agents/ui.ts` | CREATE | UI/streaming agent |
| `lib/stripe/client.ts` | CREATE | Stripe with idempotency |
| `app/api/agent/route.ts` | CREATE | Main SSE endpoint |
| `app/api/refunds/webhook/route.ts` | CREATE | Stripe webhook handler |
| `app/dashboard/page.tsx` | CREATE | Dashboard layout |
| `prisma/schema.prisma` | MODIFY | Add pgvector tables |
| `lib/env.js` | MODIFY | Add new env vars |

## Environment Variables

```env
# Supabase
SUPABASE_URL="https://xxx.supabase.co"
SUPABASE_ANON_KEY="xxx"
SUPABASE_SERVICE_ROLE_KEY="xxx"

# Redis (checkpointing)
REDIS_URL="redis://localhost:6379"

# Stripe
STRIPE_SECRET_KEY="sk_test_xxx"
STRIPE_WEBHOOK_SECRET="whsec_xxx"

# SerpAPI (optional)
SERPAPI_API_KEY="xxx"

# Vercel/Next.js
VERCEL_AI_SDK_VERSION="4.x"
```

## Pitfall Mitigations

### 1. Stripe Webhook Failures
- **Solution**: Idempotency keys + database state validation
- **Implementation**: Every refund request generates unique key, webhook verifies against DB

### 2. Vector Search Latency
- **Solution**: Hybrid BM25 + pgvector
- **Implementation**:
  - Fast BM25 for exact product/order searches
  - Vector search only for preference-based queries
  - Cache vector results in Redis

### 3. Vercel Function Timeouts
- **Solution**: Chunked prompt processing
- **Implementation**:
  - Stream partial results immediately
  - Use background jobs for long operations
  - Redis for state across chunks

## Testing Strategy

1. **Unit Tests**: Each agent node logic
2. **Integration Tests**: Full conversation flows
3. **E2E Tests**: Browser automation via Playwright
4. **Load Tests**: Concurrent user simulations

## Migration Path

1. **Phase 1 (Week 1)**: Infrastructure setup
2. **Phase 2 (Week 2)**: LangGraph implementation
3. **Phase 3 (Week 3)**: Frontend dashboard
4. **Phase 4 (Week 4)**: Testing + deployment

## Success Metrics

- **Latency**: < 500ms first token (supervisor classification)
- **Accuracy**: > 95% intent classification accuracy
- **Reliability**: 99.9% webhook delivery rate
- **User Satisfaction**: < 2min average resolution time
