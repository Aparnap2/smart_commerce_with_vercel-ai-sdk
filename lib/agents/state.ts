/**
 * E-Commerce Support Agent - State Definitions
 *
 * Defines TypedDict-style state for the hierarchical LangGraph agent architecture.
 * Includes supervisor state, agent states, and shared context types.
 *
 * @packageDocumentation
 */

import { z } from 'zod';

/**
 * Zod schemas for runtime validation of state values.
 */
export const IntentTypeSchema = z.enum([
  'refund_request',
  'order_inquiry',
  'product_search',
  'ticket_create',
  'general_support',
]);

export const MessageRoleSchema = z.enum([
  'human',
  'ai',
  'tool',
  'system',
]);

export const ToolCallStatusSchema = z.enum([
  'pending',
  'success',
  'error',
]);

/**
 * Message types for conversation history.
 * Supports human messages, AI responses, and tool calls/results.
 */
export const MessageSchema = z.object({
  id: z.string().uuid(),
  role: MessageRoleSchema,
  content: z.string(),
  timestamp: z.number().int(),
  metadata: z.record(z.unknown()).optional(),
});

export type Message = z.infer<typeof MessageSchema>;

export const ToolResultSchema = z.object({
  id: z.string(),
  tool_name: z.string(),
  status: ToolCallStatusSchema,
  input: z.record(z.unknown()),
  output: z.unknown(),
  error: z.string().optional(),
  timestamp: z.number().int(),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

/**
 * Query context extracted from user messages.
 * Includes extracted entities and search parameters.
 */
export const QueryContextSchema = z.object({
  order_id: z.string().optional(),
  product_id: z.string().optional(),
  customer_email: z.string().email().optional(),
  ticket_id: z.string().optional(),
  refund_amount: z.number().positive().optional(),
  search_query: z.string().optional(),
  date_range: z.object({
    start: z.number().int().optional(),
    end: z.number().int().optional(),
  }).optional(),
});

export type QueryContext = z.infer<typeof QueryContextSchema>;

/**
 * User preferences and embedding for personalization.
 */
export const UserPreferencesSchema = z.object({
  preferred_language: z.string().default('en'),
  communication_style: z.enum(['formal', 'casual', 'technical']).default('casual'),
  frequently_ordered_categories: z.array(z.string()).default([]),
  average_order_value: z.number().nonnegative().optional(),
  sentiment_score: z.number().min(-1).max(1).optional(),
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

/**
 * Reflection/validation result from the critic node.
 */
export const ReflectionResultSchema = z.object({
  is_valid: z.boolean(),
  confidence: z.number().min(0).max(1),
  policy_compliant: z.boolean(),
  quality_score: z.number().min(0).max(100),
  suggestions: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
  needs_human_review: z.boolean().default(false),
});

export type ReflectionResult = z.infer<typeof ReflectionResultSchema>;

/**
 * Intent classification result with confidence score.
 */
export const IntentClassificationSchema = z.object({
  intent: IntentTypeSchema,
  confidence: z.number().min(0).max(1),
  extracted_entities: QueryContextSchema,
  suggested_routing: z.enum(['refund', 'tool', 'ui']).optional(),
});

export type IntentClassification = z.infer<typeof IntentClassificationSchema>;

/**
 * Refund-specific state for the RefundAgent.
 */
export const RefundStateSchema = z.object({
  order_id: z.string(),
  refund_amount: z.number().positive(),
  reason: z.string().min(1),
  idempotency_key: z.string().uuid(),
  stripe_refund_id: z.string().optional(),
  status: z.enum(['pending', 'validating', 'processing', 'completed', 'failed']),
  error_message: z.string().optional(),
});

export type RefundState = z.infer<typeof RefundStateSchema>;

/**
 * Tool execution state for the ToolAgent.
 */
export const ToolExecutionStateSchema = z.object({
  query_type: z.enum(['db', 'serp', 'vector', 'hybrid']),
  search_query: z.string(),
  db_results: z.unknown().optional(),
  serp_results: z.unknown().optional(),
  vector_results: z.unknown().optional(),
  combined_results: z.unknown().optional(),
  execution_time_ms: z.number().int().nonnegative().optional(),
});

export type ToolExecutionState = z.infer<typeof ToolExecutionStateSchema>;

/**
 * UI/streaming state for the UIAgent.
 */
export const UIStateSchema = z.object({
  response_format: z.enum(['markdown', 'json', 'chart_data', 'stream']),
  chart_type: z.enum(['line', 'bar', 'pie', 'table']).optional(),
  chart_data: z.unknown().optional(),
  streaming: z.boolean().default(true),
  partial_updates: z.array(z.string()).default([]),
  final_response: z.string().optional(),
});

export type UIState = z.infer<typeof UIStateSchema>;

/**
 * Agent metadata for tracking and debugging.
 */
export const AgentMetadataSchema = z.object({
  thread_id: z.string().uuid(),
  user_id: z.string().uuid(),
  session_start: z.number().int(),
  last_updated: z.number().int(),
  node_visits: z.record(z.number().int()).default({}),
  total_tokens: z.number().int().nonnegative().default(0),
});

export type AgentMetadata = z.infer<typeof AgentMetadataSchema>;

/**
 * Main agent state combining all components.
 * Used as the TypedDict equivalent in TypeScript LangGraph.
 */
export const AgentStateSchema = z.object({
  // Message history with reducer
  messages: z.array(MessageSchema).default([]),

  // Current intent classification
  intent: IntentClassificationSchema.optional(),

  // Extracted context from query
  context: QueryContextSchema.default({}),

  // User preferences and history
  user_preferences: UserPreferencesSchema.default({}),

  // Tool execution results
  tool_results: z.array(ToolResultSchema).default([]),

  // Reflection/validation results
  reflection: ReflectionResultSchema.optional(),

  // Agent-specific states
  refund_state: RefundStateSchema.optional(),
  tool_state: ToolExecutionStateSchema.optional(),
  ui_state: UIStateSchema.optional(),

  // Metadata for tracking
  metadata: AgentMetadataSchema,

  // Current routing target
  current_agent: z.enum(['supervisor', 'refund', 'tool', 'ui']).default('supervisor'),

  // Error handling
  error: z.string().optional(),
});

export type AgentState = z.infer<typeof AgentStateSchema>;

/**
 * Initial state factory function.
 * Creates a properly initialized agent state.
 */
export function createInitialState(
  threadId: string,
  userId: string,
  initialMessage?: string
): AgentState {
  const now = Date.now();
  const messages: Message[] = initialMessage
    ? [
        {
          id: crypto.randomUUID(),
          role: 'human',
          content: initialMessage,
          timestamp: now,
        },
      ]
    : [];

  return {
    messages,
    context: {},
    user_preferences: {},
    tool_results: [],
    metadata: {
      thread_id: threadId,
      user_id: userId,
      session_start: now,
      last_updated: now,
      node_visits: {},
      total_tokens: 0,
    },
    current_agent: 'supervisor',
  };
}
