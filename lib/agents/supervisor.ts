/**
 * E-Commerce Support Agent - Supervisor Agent
 *
 * Implements the supervisor agent that routes queries to specialized agents:
 * - RefundAgent: Handles refund requests
 * - ToolAgent: Handles database queries and searches
 * - UIAgent: Handles response formatting and streaming
 *
 * Uses Gemini 2.0 Flash for fast intent classification.
 *
 * @packageDocumentation
 */

import {
  StateGraph,
  END,
  START,
  Annotation,
  CompiledStateGraph,
} from '@langchain/langgraphs';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { SystemMessage, HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';

import type {
  AgentState,
  IntentClassification,
  QueryContext,
} from './state.js';
import {
  IntentTypeSchema,
  createInitialState,
} from './state.js';

/**
 * Supervisor configuration constants.
 */
const SUPERVISOR_SYSTEM_PROMPT = `You are the supervisor for an e-commerce support system.
Your role is to classify incoming user queries and route them to the appropriate specialized agent.

Available agents:
1. REFUND_AGENT - Handles refund requests, order cancellations, and payment issues
2. TOOL_AGENT - Handles database queries, product searches, order lookups, and information retrieval
3. UI_AGENT - Handles response formatting, streaming, and UI updates for general inquiries

When classifying, consider:
- Is the user asking for a refund or reversal of payment? -> REFUND_AGENT
- Is the user asking for specific data (orders, products, account info)? -> TOOL_AGENT
- Is the user asking a general question or needing a response formatted? -> UI_AGENT

Return a JSON object with:
- intent: one of ['refund_request', 'order_inquiry', 'product_search', 'ticket_create', 'general_support']
- confidence: a number between 0 and 1
- extracted_entities: any relevant order IDs, product IDs, emails, etc.
- suggested_routing: one of ['refund', 'tool', 'ui']`;

/**
 * Input/output annotations for the state graph.
 * Uses LangGraph's Annotation for composable state updates.
 */
const SupervisorAnnotation = Annotation.Root({
  /** Message history with automatic append reducer */
  messages: Annotation({
    reducer: (left: Array<SystemMessage | HumanMessage | AIMessage | ToolMessage>, right: Array<SystemMessage | HumanMessage | AIMessage | ToolMessage>) => [...left, ...right],
    default: () => [],
  }),

  /** Current intent classification */
  intent: Annotation<IntentClassification | undefined>(),

  /** Extracted query context */
  context: Annotation<QueryContext>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),

  /** Current routing target */
  current_agent: Annotation<string>({
    reducer: (current, update) => update ?? current,
    default: () => 'supervisor',
  }),

  /** Error state */
  error: Annotation<string | undefined>(),
});

/**
 * Creates the supervisor graph with all nodes and edges.
 *
 * @param llm - The LLM instance for intent classification
 * @returns Compiled state graph
 */
export function createSupervisorGraph(
  llm: ChatGoogleGenerativeAI
): CompiledStateGraph<typeof SupervisorAnnotation.State, typeof SupervisorAnnotation.State, typeof SupervisorAnnotation.State> {
  const workflow = new StateGraph(SupervisorAnnotation);

  /**
   * Intent classification node.
   * Uses LLM to classify the user query and extract entities.
   */
  workflow.addNode('classify_query', async (state) => {
    const recentMessages = state.messages.slice(-10);
    const contextStr = state.context ? JSON.stringify(state.context) : '{}';

    const response = await llm.invoke([
      new SystemMessage(SUPERVISOR_SYSTEM_PROMPT),
      ...recentMessages,
      new HumanMessage(`Classify this query and extract entities. Context: ${contextStr}`),
    ]);

    let classification: IntentClassification;
    try {
      const content = response.content as string;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;

      const parsed = JSON.parse(jsonStr);
      classification = {
        intent: IntentTypeSchema.parse(parsed.intent),
        confidence: parsed.confidence ?? 0.8,
        extracted_entities: parsed.extracted_entities ?? {},
        suggested_routing: parsed.suggested_routing,
      };
    } catch (parseError) {
      // Fallback classification on parse error
      classification = {
        intent: 'general_support',
        confidence: 0.5,
        extracted_entities: {},
      };
    }

    return {
      intent: classification,
      context: classification.extracted_entities,
      current_agent: getRoutingTarget(classification),
    };
  });

  /**
   * Router node - directs to appropriate agent based on intent.
   * This is the entry point after classification.
   */
  workflow.addNode('route_to_agent', (state) => {
    return {
      current_agent: getRoutingTarget(state.intent),
    };
  });

  /**
   * Refund processing node (entry point for refund flows).
   */
  workflow.addNode('refund_agent', async (state) => {
    // Refund agent handles its own state management
    return {
      current_agent: 'refund',
    };
  });

  /**
   * Tool execution node (entry point for data queries).
   */
  workflow.addNode('tool_agent', async (state) => {
    // Tool agent handles its own state management
    return {
      current_agent: 'tool',
    };
  });

  /**
   * UI response node (entry point for general responses).
   */
  workflow.addNode('ui_agent', async (state) => {
    // UI agent handles its own state management
    return {
      current_agent: 'ui',
    };
  });

  /**
   * Reflector node - validates agent outputs.
   */
  workflow.addNode('reflect', async (state) => {
    // Placeholder for reflection logic
    return {
      reflection: {
        is_valid: true,
        confidence: 0.9,
        policy_compliant: true,
        quality_score: 85,
        suggestions: [],
        concerns: [],
        needs_human_review: false,
      },
    };
  });

  // Define edges
  workflow.addEdge(START, 'classify_query');
  workflow.addEdge('classify_query', 'route_to_agent');

  // Conditional routing from route_to_agent
  workflow.addConditionalEdges(
    'route_to_agent',
    (state) => {
      const routing = state.intent?.suggested_routing ?? getRoutingTarget(state.intent);
      switch (routing) {
        case 'refund':
          return 'refund_agent';
        case 'tool':
          return 'tool_agent';
        case 'ui':
        default:
          return 'ui_agent';
      }
    },
    {
      refund_agent: 'refund_agent',
      tool_agent: 'tool_agent',
      ui_agent: 'ui_agent',
    }
  );

  // Agents flow to reflect then END
  workflow.addEdge('refund_agent', 'reflect');
  workflow.addEdge('tool_agent', 'reflect');
  workflow.addEdge('ui_agent', 'reflect');
  workflow.addEdge('reflect', END);

  return workflow.compile();
}

/**
 * Determines the routing target based on intent classification.
 *
 * @param classification - The intent classification result
 * @returns The agent to route to
 */
function getRoutingTarget(
  classification?: IntentClassification
): 'refund' | 'tool' | 'ui' {
  if (!classification) {
    return 'ui';
  }

  const intent = classification.intent;
  if (
    intent === 'refund_request' ||
    intent === 'ticket_create'
  ) {
    return 'refund';
  }

  if (
    intent === 'order_inquiry' ||
    intent === 'product_search'
  ) {
    return 'tool';
  }

  return 'ui';
}

/**
 * Creates a supervisor graph with default Gemini 2.0 Flash model.
 *
 * @param config - Optional configuration
 * @returns Compiled state graph
 */
export function createDefaultSupervisorGraph(
  config?: {
    modelName?: string;
    temperature?: number;
  }
): CompiledStateGraph<typeof SupervisorAnnotation.State, typeof SupervisorAnnotation.State, typeof SupervisorAnnotation.State> {
  const modelName = config?.modelName ?? 'gemini-2.0-flash-exp';
  const temperature = config?.temperature ?? 0.1;

  const llm = new ChatGoogleGenerativeAI({
    model: modelName,
    temperature,
    maxOutputTokens: 2048,
  });

  return createSupervisorGraph(llm);
}

/**
 * Supervisor agent class for encapsulation.
 * Provides a clean interface for the supervisor workflow.
 */
export class SupervisorAgent {
  private graph: CompiledStateGraph<typeof SupervisorAnnotation.State, typeof SupervisorAnnotation.State, typeof SupervisorAnnotation.State>;

  constructor(
    graph: CompiledStateGraph<typeof SupervisorAnnotation.State, typeof SupervisorAnnotation.State, typeof SupervisorAnnotation.State>
  ) {
    this.graph = graph;
  }

  /**
   * Processes a user query and returns the final state.
   *
   * @param threadId - Unique thread identifier
   * @param userId - User identifier
   * @param message - User message
   * @returns Final agent state
   */
  async process(
    threadId: string,
    userId: string,
    message: string
  ): Promise<AgentState> {
    const state = createInitialState(threadId, userId, message);
    const messages = state.messages.map(m => {
      if (m.role === 'human') {
        return new HumanMessage(m.content);
      }
      if (m.role === 'ai') {
        return new AIMessage(m.content);
      }
      return new HumanMessage(m.content);
    });

    const result = await this.graph.invoke({
      messages,
      context: {},
      current_agent: 'supervisor',
    });

    return {
      ...state,
      intent: result.intent,
      context: result.context ?? {},
      current_agent: result.current_agent as AgentState['current_agent'],
      error: result.error,
    };
  }

  /**
   * Gets the underlying graph for streaming.
   */
  getGraph(): CompiledStateGraph<typeof SupervisorAnnotation.State, typeof SupervisorAnnotation.State, typeof SupervisorAnnotation.State> {
    return this.graph;
  }
}

/**
 * Creates a supervisor agent with default configuration.
 */
export function createSupervisorAgent(): SupervisorAgent {
  const graph = createDefaultSupervisorGraph();
  return new SupervisorAgent(graph);
}
