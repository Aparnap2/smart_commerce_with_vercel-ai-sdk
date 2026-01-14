/**
 * E-Commerce Support Agent - UI Agent
 *
 * Handles response formatting and streaming for frontend integration:
 * - format_response: Formats content for display (markdown, JSON, charts)
 * - stream_sse: Manages Server-Sent Events streaming
 * - update_chart: Prepares chart data for visualizations
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
  UIState,
  ToolResult,
  QueryContext,
} from './state.js';

/**
 * UI agent annotation for state management.
 */
const UIAnnotation = Annotation.Root({
  /** UI state for formatting and streaming */
  ui_state: Annotation<UIState | undefined>(),

  /** Tool results to include in response */
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
  current_step: Annotation<'format' | 'stream' | 'chart' | 'complete'>({
    reducer: (current, update) => update ?? current,
    default: () => 'format',
  }),

  /** Error state */
  error: Annotation<string | undefined>(),
});

/**
 * Chart data types for visualizations.
 */
export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface ChartConfig {
  type: 'line' | 'bar' | 'pie' | 'table';
  title: string;
  data: ChartDataPoint[];
  xAxis?: string;
  yAxis?: string;
}

/**
 * Formats content based on the requested format type.
 */
function formatContent(
  content: string,
  format: 'markdown' | 'json' | 'chart_data',
  chartData?: ChartConfig
): string {
  switch (format) {
    case 'json':
      try {
        // Try to parse and pretty-print as JSON
        const parsed = JSON.parse(content);
        return JSON.stringify(parsed, null, 2);
      } catch {
        // If not JSON, wrap in a JSON response
        return JSON.stringify({ response: content }, null, 2);
      }

    case 'chart_data':
      if (chartData) {
        return JSON.stringify(chartData, null, 2);
      }
      return JSON.stringify({
        type: 'line',
        title: 'Response Data',
        data: [{ label: 'Value', value: 1 }],
      }, null, 2);

    case 'markdown':
    default:
      return content;
  }
}

/**
 * Creates the UIAgent graph with formatting and streaming nodes.
 *
 * @param llm - LLM instance for response generation
 * @returns Compiled state graph
 */
export function createUIGraph(
  llm: ChatGoogleGenerativeAI
): CompiledStateGraph<typeof UIAnnotation.State, typeof UIAnnotation.State, typeof UIAnnotation.State> {
  const workflow = new StateGraph(UIAnnotation);

  /**
   * Node: format_response
   * Formats the response for the appropriate output type.
   */
  workflow.addNode('format_response', async (state) => {
    const context = state.context;
    const toolResults = state.tool_results;

    // Determine response format based on context and tools
    let responseFormat: 'markdown' | 'json' | 'chart_data' = 'markdown';
    let chartType: 'line' | 'bar' | 'pie' | 'table' | undefined;

    if (context.order_id || context.product_id) {
      responseFormat = 'json';
    }

    // Generate formatted response
    const formatPrompt = `Format this response for the user:
Context: ${JSON.stringify(context)}
Tool Results: ${JSON.stringify(toolResults.map(r => r.output))}

Provide a clear, concise response in ${responseFormat} format.`;

    try {
      const response = await llm.invoke([
        new HumanMessage(formatPrompt),
      ]);

      const rawContent = response.content as string;
      const formattedContent = formatContent(rawContent, responseFormat);

      const uiState: UIState = {
        response_format: responseFormat,
        chart_type: chartType,
        chart_data: chartType ? { type: chartType, title: '', data: [] } : undefined,
        streaming: true,
        partial_updates: [],
        final_response: formattedContent,
      };

      return {
        ui_state: uiState,
        current_step: 'stream',
        messages: [
          new AIMessage('Response formatted. Preparing stream...'),
        ],
      };
    } catch (err) {
      return {
        current_step: 'error',
        error: `Formatting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  });

  /**
   * Node: stream_sse
   * Prepares content for Server-Sent Events streaming.
   */
  workflow.addNode('stream_sse', async (state) => {
    const content = state.ui_state?.final_response ?? '';

    // Generate SSE-formatted chunks
    const chunks: string[] = [];
    const words = content.split(' ');

    for (let i = 0; i < words.length; i++) {
      const chunk = words.slice(0, i + 1).join(' ');
      chunks.push(`data: ${JSON.stringify({ type: 'chunk', content: words[i] })}\n\n`);
    }

    // Send final message
    chunks.push(`data: ${JSON.stringify({ type: 'complete', content: 'Stream complete' })}\n\n`);

    return {
      ui_state: {
        ...state.ui_state,
        streaming: true,
        partial_updates: chunks,
      },
      current_step: 'chart',
      messages: [
        new AIMessage(`Streaming prepared (${chunks.length} chunks).`),
      ],
    };
  });

  /**
   * Node: update_chart
   * Prepares chart data for frontend visualizations.
   */
  workflow.addNode('update_chart', async (state) => {
    const toolResults = state.tool_results;
    const context = state.context;

    // Check if chart update is needed
    const needsChart = toolResults.length > 0 || context.order_id;

    if (!needsChart) {
      return {
        current_step: 'complete',
        ui_state: state.ui_state,
      };
    }

    // Generate chart data from tool results
    const chartPrompt = `Create chart data from these results:
Tool Results: ${JSON.stringify(toolResults.map(r => r.output))}
Context: ${JSON.stringify(context)}

Return JSON for a chart with:
- type: "line" | "bar" | "pie" | "table"
- title: chart title
- data: array of { label, value, color? }
- xAxis, yAxis: axis labels if applicable`;

    try {
      const response = await llm.invoke([
        new HumanMessage(chartPrompt),
      ]);

      const content = response.content as string;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const chartData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

      return {
        ui_state: {
          ...state.ui_state,
          response_format: 'chart_data',
          chart_type: chartData?.type ?? 'bar',
          chart_data: chartData,
          streaming: false,
        },
        current_step: 'complete',
        messages: [
          new AIMessage('Chart data prepared for visualization.'),
        ],
      };
    } catch (err) {
      // Fallback to simple chart
      return {
        current_step: 'complete',
        ui_state: {
          ...state.ui_state,
          chart_data: {
            type: 'bar',
            title: 'Results',
            data: [{ label: 'Items', value: toolResults.length }],
          },
        },
      };
    }
  });

  // Define edges
  workflow.addEdge('format_response', 'stream_sse');
  workflow.addEdge('stream_sse', 'update_chart');
  workflow.addEdge('update_chart', END);

  return workflow.compile();
}

/**
 * Creates a UI graph with default Gemini 2.0 Flash model.
 */
export function createDefaultUIGraph(): CompiledStateGraph<typeof UIAnnotation.State, typeof UIAnnotation.State, typeof UIAnnotation.State> {
  const llm = new ChatGoogleGenerativeAI({
    model: 'gemini-2.0-flash-exp',
    temperature: 0.3,
    maxOutputTokens: 2048,
  });

  return createUIGraph(llm);
}

/**
 * UIAgent class for encapsulating UI/streaming logic.
 */
export class UIAgent {
  private graph: CompiledStateGraph<typeof UIAnnotation.State, typeof UIAnnotation.State, typeof UIAnnotation.State>;

  constructor(
    graph?: CompiledStateGraph<typeof UIAnnotation.State, typeof UIAnnotation.State, typeof UIAnnotation.State>
  ) {
    this.graph = graph ?? createDefaultUIGraph();
  }

  /**
   * Processes content and prepares for UI rendering.
   *
   * @param content - Content to format
   * @param context - Query context
   * @param toolResults - Results from tool agent
   * @returns UI state with formatted content and chart data
   */
  async process(
    content: string,
    context?: Partial<QueryContext>,
    toolResults?: ToolResult[]
  ): Promise<{
    uiState: UIState | undefined;
    error?: string;
  }> {
    const initialState = {
      ui_state: {
        response_format: 'markdown',
        streaming: true,
        partial_updates: [],
        final_response: content,
      },
      tool_results: toolResults ?? [],
      context: context ?? {},
      messages: [] as Array<HumanMessage | AIMessage>,
      current_step: 'format' as const,
    };

    const result = await this.graph.invoke(initialState);

    return {
      uiState: result.ui_state,
      error: result.error,
    };
  }

  /**
   * Generates SSE-compatible stream chunks.
   *
   * @param content - Content to stream
   * @param chunkSize - Words per chunk
   * @returns SSE-formatted chunks
   */
  generateStreamChunks(
    content: string,
    chunkSize: number = 5
  ): string[] {
    const chunks: string[] = [];
    const words = content.split(' ');

    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      chunks.push(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
    }

    chunks.push(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
    chunks.push('data: [DONE]\n\n');

    return chunks;
  }

  /**
   * Gets the underlying graph for integration.
   */
  getGraph(): CompiledStateGraph<typeof UIAnnotation.State, typeof UIAnnotation.State, typeof UIAnnotation.State> {
    return this.graph;
  }
}

/**
 * Creates a UI agent with default configuration.
 */
export function createUIAgent(): UIAgent {
  return new UIAgent();
}

/**
 * SSE stream response helper.
 */
export interface StreamResponse {
  chunks: string[];
  content: string;
  chartData?: ChartConfig;
}

/**
 * Creates an SSE stream from content and UI state.
 */
export function createSSEStream(
  content: string,
  uiState?: UIState
): StreamResponse {
  const chunks: string[] = [];
  const words = content.split(' ');

  // Generate word-by-word chunks for streaming
  for (let i = 0; i < words.length; i++) {
    const chunkData = {
      type: 'token',
      content: words[i],
      index: i,
      total: words.length,
    };
    chunks.push(`data: ${JSON.stringify(chunkData)}\n\n`);
  }

  // Add chart data if present
  let chartData: ChartConfig | undefined;
  if (uiState?.chart_data) {
    chartData = uiState.chart_data as ChartConfig;
    chunks.push(`data: ${JSON.stringify({ type: 'chart', data: chartData })}\n\n`);
  }

  // Final message
  chunks.push(`data: ${JSON.stringify({ type: 'complete', totalTokens: words.length })}\n\n`);
  chunks.push('data: [DONE]\n\n');

  return {
    chunks,
    content,
    chartData,
  };
}
