/**
 * E-Commerce Support Agent - Agent Index
 *
 * Central export for all agent modules.
 * Provides factory functions and classes for creating agent instances.
 *
 * @packageDocumentation
 */

// State definitions
export * from './state.js';

// Supervisor agent
export {
  createSupervisorGraph,
  createDefaultSupervisorGraph,
  SupervisorAgent,
  createSupervisorAgent,
} from './supervisor.js';

// Refund agent (with Stripe integration)
export {
  createRefundGraph,
  createDefaultRefundGraph,
  RefundAgent,
  createRefundAgent,
  type RefundAgentState,
  type RefundHistoryEntry,
  initiateRefundSchema,
  validateRefundSchema,
  executeRefundSchema,
} from './refund.js';

// Tool agent (with hybrid search)
export {
  createToolGraph,
  createDefaultToolGraph,
  ToolAgent,
  createToolAgent,
  type ChartDataPoint,
  type ChartConfig,
} from './tool.js';

// UI agent (with streaming)
export {
  createUIGraph,
  createDefaultUIGraph,
  UIAgent,
  createUIAgent,
  createSSEStream,
  type StreamResponse,
  type UIState,
} from './ui.js';

/**
 * Agent type for routing decisions.
 */
export type AgentType = 'supervisor' | 'refund' | 'tool' | 'ui';

/**
 * Creates all agent graphs with default configuration.
 */
export interface AgentGraphs {
  supervisor: ReturnType<typeof createSupervisorGraph>;
  refund: ReturnType<typeof createRefundGraph>;
  tool: ReturnType<typeof createToolGraph>;
  ui: ReturnType<typeof createUIGraph>;
}

/**
 * Creates all agent graphs with default configuration.
 */
export function createAllAgentGraphs(): AgentGraphs {
  return {
    supervisor: createDefaultSupervisorGraph(),
    refund: createDefaultRefundGraph(),
    tool: createDefaultToolGraph(),
    ui: createDefaultUIGraph(),
  };
}
