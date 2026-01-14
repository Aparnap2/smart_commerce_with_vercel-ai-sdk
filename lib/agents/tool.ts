/**
 * E-Commerce Support Agent - Tool Agent
 *
 * Handles database queries and searches with hybrid search capabilities:
 * - db_query: PostgreSQL/Prisma queries for orders, products
 * - serp_search: Web search via SerpAPI for external info
 * - vector_search: pgvector for semantic search on preferences
 *
 * @packageDocumentation
 */

import {
  StateGraph,
  END,
  Annotation,
  CompiledStateGraph,
} from '@langchain/langgraphs';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

import type {
  AgentState,
  ToolExecutionState,
  ToolResult,
  QueryContext,
} from './state.js';

/**
 * Tool agent annotation for state management.
 */
const ToolAnnotation = Annotation.Root({
  /** Tool execution state */
  tool_state: Annotation<ToolExecutionState | undefined>(),

  /** Accumulated tool results */
  tool_results: Annotation<ToolResult[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),

  /** Query context */
  context: Annotation<QueryContext>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),

  /** Messages with append reducer */
  messages: Annotation<Array<HumanMessage | AIMessage>>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),

  /** Current processing step */
  current_step: Annotation<'db' | 'serp' | 'vector' | 'combine' | 'complete'>({
    reducer: (current, update) => update ?? current,
    default: () => 'db',
  }),

  /** Error state */
  error: Annotation<string | undefined>(),
});

/**
 * Simulates a database query for orders/products.
 * In production, replace with actual Prisma queries.
 */
async function executeDbQuery(
  queryType: 'orders' | 'products' | 'customers' | 'tickets',
  params: Record<string, unknown>
): Promise<unknown> {
  // Simulate DB latency
  await new Promise(resolve => setTimeout(resolve, 50));

  // Mock response based on query type
  switch (queryType) {
    case 'orders':
      return {
        orders: [
          {
            id: params.order_id ?? 'ORD-001',
            status: 'delivered',
            total: 99.99,
            created_at: new Date().toISOString(),
            items: [{ name: 'Product A', qty: 2, price: 49.99 }],
          },
        ],
        count: 1,
      };

    case 'products':
      return {
        products: [
          {
            id: params.product_id ?? 'PROD-001',
            name: 'Sample Product',
            price: 29.99,
            category: 'Electronics',
            rating: 4.5,
            stock: 150,
          },
        ],
        count: 1,
      };

    case 'customers':
      return {
        customers: [
          {
            id: params.customer_id ?? 'CUST-001',
            email: 'customer@example.com',
            name: 'John Doe',
            total_orders: 5,
            lifetime_value: 499.95,
          },
        ],
        count: 1,
      };

    case 'tickets':
      return {
        tickets: [
          {
            id: params.ticket_id ?? 'TICKET-001',
            subject: 'Order Inquiry',
            status: 'open',
            priority: 'medium',
            created_at: new Date().toISOString(),
          },
        ],
        count: 1,
      };

    default:
      return { error: 'Unknown query type' };
  }
}

/**
 * Simulates a web search via SerpAPI.
 * In production, integrate with actual SerpAPI.
 */
async function executeSerpSearch(
  query: string
): Promise<unknown> {
  // Simulate search latency
  await new Promise(resolve => setTimeout(resolve, 100));

  return {
    query,
    results: [
      {
        title: 'E-commerce FAQ',
        url: 'https://example.com/faq',
        snippet: 'Common questions about orders, shipping, and returns.',
      },
      {
        title: 'Return Policy',
        url: 'https://example.com/returns',
        snippet: '30-day return policy for all items in original condition.',
      },
    ],
    count: 2,
  };
}

/**
 * Simulates a vector search via pgvector.
 * In production, use actual pgvector queries.
 */
async function executeVectorSearch(
  query: string,
  userId?: string
): Promise<unknown> {
  // Simulate vector search latency
  await new Promise(resolve => setTimeout(resolve, 75));

  return {
    query,
    user_id: userId,
    embeddings: [
      {
        id: 'PREF-001',
        category: 'Electronics',
        similarity: 0.92,
        recent_purchases: ['Laptop', 'Headphones'],
      },
      {
        id: 'PREF-002',
        category: 'Books',
        similarity: 0.85,
        recent_purchases: ['Novels', 'Self-help'],
      },
    ],
    count: 2,
  };
}

/**
 * Creates the ToolAgent graph with hybrid search nodes.
 *
 * @param llm - LLM instance for query optimization
 * @returns Compiled state graph
 */
export function createToolGraph(
  llm: ChatGoogleGenerativeAI
): CompiledStateGraph<typeof ToolAnnotation.State, typeof ToolAnnotation.State, typeof ToolAnnotation.State> {
  const workflow = new StateGraph(ToolAnnotation);

  /**
   * Node: db_query
   * Executes database queries via Prisma.
   */
  workflow.addNode('db_query', async (state) => {
    const context = state.context;
    const startTime = Date.now();

    let queryType: 'orders' | 'products' | 'customers' | 'tickets' = 'orders';
    const params: Record<string, unknown> = {};

    // Determine query type from context
    if (context.order_id) {
      queryType = 'orders';
      params.order_id = context.order_id;
    } else if (context.product_id) {
      queryType = 'products';
      params.product_id = context.product_id;
    } else if (context.customer_email) {
      queryType = 'customers';
      params.customer_email = context.customer_email;
    } else if (context.ticket_id) {
      queryType = 'tickets';
      params.ticket_id = context.ticket_id;
    }

    try {
      const dbResults = await executeDbQuery(queryType, params);
      const executionTime = Date.now() - startTime;

      const toolResult: ToolResult = {
        id: crypto.randomUUID(),
        tool_name: 'db_query',
        status: 'success',
        input: { query_type: queryType, params },
        output: dbResults,
        timestamp: Date.now(),
      };

      return {
        tool_state: {
          query_type: 'db',
          search_query: context.search_query ?? '',
          db_results: dbResults,
          execution_time_ms: executionTime,
        },
        tool_results: [toolResult],
        current_step: 'serp',
        messages: [
          new AIMessage(`Database query completed (${queryType}). Found results.`),
        ],
      };
    } catch (err) {
      return {
        current_step: 'error',
        error: `DB query failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        tool_results: [
          {
            id: crypto.randomUUID(),
            tool_name: 'db_query',
            status: 'error',
            input: { query_type: queryType, params },
            error: err instanceof Error ? err.message : 'Unknown error',
            timestamp: Date.now(),
          },
        ],
      };
    }
  });

  /**
   * Node: serp_search
   * Performs web search for external information.
   */
  workflow.addNode('serp_search', async (state) => {
    const searchQuery = state.context.search_query ?? state.tool_state?.search_query ?? '';

    if (!searchQuery) {
      return {
        current_step: 'vector',
        tool_state: state.tool_state,
      };
    }

    try {
      const startTime = Date.now();
      const serpResults = await executeSerpSearch(searchQuery);
      const executionTime = Date.now() - startTime;

      const toolResult: ToolResult = {
        id: crypto.randomUUID(),
        tool_name: 'serp_search',
        status: 'success',
        input: { query: searchQuery },
        output: serpResults,
        timestamp: Date.now(),
      };

      return {
        tool_state: {
          ...state.tool_state,
          query_type: 'hybrid',
          serp_results: serpResults,
          execution_time_ms: (state.tool_state?.execution_time_ms ?? 0) + executionTime,
        },
        tool_results: [...state.tool_results, toolResult],
        current_step: 'vector',
        messages: [
          new AIMessage('Web search completed. Finding semantic matches...'),
        ],
      };
    } catch (err) {
      const toolResult: ToolResult = {
        id: crypto.randomUUID(),
        tool_name: 'serp_search',
        status: 'error',
        input: { query: searchQuery },
        error: err instanceof Error ? err.message : 'Unknown error',
        timestamp: Date.now(),
      };

      return {
        tool_state: state.tool_state,
        tool_results: [...state.tool_results, toolResult],
        current_step: 'vector',
      };
    }
  });

  /**
   * Node: vector_search
   * Performs semantic search via pgvector.
   */
  workflow.addNode('vector_search', async (state) => {
    const searchQuery = state.tool_state?.search_query ?? '';
    const userId = state.context.customer_email;

    try {
      const startTime = Date.now();
      const vectorResults = await executeVectorSearch(searchQuery, userId);
      const executionTime = Date.now() - startTime;

      const toolResult: ToolResult = {
        id: crypto.randomUUID(),
        tool_name: 'vector_search',
        status: 'success',
        input: { query: searchQuery, user_id: userId },
        output: vectorResults,
        timestamp: Date.now(),
      };

      return {
        tool_state: {
          ...state.tool_state,
          query_type: 'hybrid',
          vector_results: vectorResults,
          execution_time_ms: (state.tool_state?.execution_time_ms ?? 0) + executionTime,
        },
        tool_results: [...state.tool_results, toolResult],
        current_step: 'combine',
        messages: [
          new AIMessage('Semantic search completed. Combining results...'),
        ],
      };
    } catch (err) {
      const toolResult: ToolResult = {
        id: crypto.randomUUID(),
        tool_name: 'vector_search',
        status: 'error',
        input: { query: searchQuery, user_id: userId },
        error: err instanceof Error ? err.message : 'Unknown error',
        timestamp: Date.now(),
      };

      return {
        tool_state: state.tool_state,
        tool_results: [...state.tool_results, toolResult],
        current_step: 'combine',
      };
    }
  });

  /**
   * Node: combine_results
   * Merges results from all search sources.
   */
  workflow.addNode('combine_results', async (state) => {
    const dbResults = state.tool_state?.db_results;
    const serpResults = state.tool_state?.serp_results;
    const vectorResults = state.tool_state?.vector_results;

    // Combine results using LLM for smart merging
    const combinePrompt = `Combine these search results:
DB Results: ${JSON.stringify(dbResults ?? {})}
Web Results: ${JSON.stringify(serpResults ?? {})}
Vector Results: ${JSON.stringify(vectorResults ?? {})}

Provide a summary of all relevant information.`;

    try {
      const response = await llm.invoke([new HumanMessage(combinePrompt)]);

      const combined = {
        db: dbResults,
        web: serpResults,
        semantic: vectorResults,
        summary: (response.content as string).substring(0, 500),
      };

      return {
        tool_state: {
          ...state.tool_state,
          query_type: 'hybrid',
          combined_results: combined,
        },
        current_step: 'complete',
        messages: [
          new AIMessage('All results combined and ready.'),
        ],
      };
    } catch (err) {
      return {
        current_step: 'error',
        error: `Failed to combine results: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  });

  // Define edges
  workflow.addEdge('db_query', 'serp_search');
  workflow.addEdge('serp_search', 'vector_search');
  workflow.addEdge('vector_search', 'combine_results');
  workflow.addEdge('combine_results', END);

  return workflow.compile();
}

/**
 * Creates a tool graph with default Gemini 2.0 Flash model.
 */
export function createDefaultToolGraph(): CompiledStateGraph<typeof ToolAnnotation.State, typeof ToolAnnotation.State, typeof ToolAnnotation.State> {
  const llm = new ChatGoogleGenerativeAI({
    model: 'gemini-2.0-flash-exp',
    temperature: 0.1,
    maxOutputTokens: 2048,
  });

  return createToolGraph(llm);
}

/**
 * ToolAgent class for encapsulating tool execution logic.
 */
export class ToolAgent {
  private graph: CompiledStateGraph<typeof ToolAnnotation.State, typeof ToolAnnotation.State, typeof ToolAnnotation.State>;

  constructor(
    graph?: CompiledStateGraph<typeof ToolAnnotation.State, typeof ToolAnnotation.State, typeof ToolAnnotation.State>
  ) {
    this.graph = graph ?? createDefaultToolGraph();
  }

  /**
   * Processes a tool query with hybrid search.
   *
   * @param query - Search query
   * @param context - Query context with extracted entities
   * @returns Combined search results
   */
  async process(
    query: string,
    context?: Partial<QueryContext>
  ): Promise<{
    results: unknown;
    tools: ToolResult[];
    error?: string;
  }> {
    const initialState = {
      tool_state: {
        query_type: 'hybrid' as const,
        search_query: query,
      },
      tool_results: [] as ToolResult[],
      context: context ?? {},
      messages: [] as Array<HumanMessage | AIMessage>,
      current_step: 'db' as const,
    };

    const result = await this.graph.invoke(initialState);

    return {
      results: result.tool_state?.combined_results ?? result.tool_state?.db_results,
      tools: result.tool_results,
      error: result.error,
    };
  }

  /**
   * Gets the underlying graph for integration.
   */
  getGraph(): CompiledStateGraph<typeof ToolAnnotation.State, typeof ToolAnnotation.State, typeof ToolAnnotation.State> {
    return this.graph;
  }
}

/**
 * Creates a tool agent with default configuration.
 */
export function createToolAgent(): ToolAgent {
  return new ToolAgent();
}
