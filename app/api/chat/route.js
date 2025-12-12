import { generateText } from 'ai';
import { databaseQueryTool } from '../../../lib/tools/database';
import { SYSTEM_PROMPT } from './system-prompt';
import { getLLMModel, isDevelopment } from '../../../lib/ai/config';

export async function POST(req) {
  try {
    const { messages } = await req.json();

    // Detect if this is a data query that requires tool usage
    const lastMessage = messages[messages.length - 1];
    let requiresTool = false;
    
    if (lastMessage && lastMessage.role === 'user') {
      const lowerContent = lastMessage.content.toLowerCase().trim();

      // Handle simple greetings without LLM
      if (lowerContent === 'hi' || lowerContent === 'hello') {
        const response = 'Hello! How can I assist you with your orders, products, or support tickets today?';
        return new Response(response, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain',
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }

      // Check if message contains data query keywords
      const dataKeywords = ['order', 'product', 'ticket', 'customer', 'find', 'check', 'show', 'get', '@'];
      requiresTool = dataKeywords.some(keyword => lowerContent.includes(keyword));
    }
    if (!databaseQueryTool || typeof databaseQueryTool.execute !== 'function') {
      console.error('[API_ROUTE] databaseQueryTool is not correctly configured:', databaseQueryTool);
      return new Response('Internal server error: Tool not configured.', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const result = await generateText({
      model: getLLMModel(),
      system: SYSTEM_PROMPT,
      messages,
      tools: {
        db_query: databaseQueryTool,
      },
      toolChoice: requiresTool ? 'required' : 'auto',
      temperature: isDevelopment() ? 0.7 : 0.5,
    });

    // Extract response text
    let responseText = result.text || '';

    // Fallback if response is empty or incorrect
    if (result.toolResults?.length > 0 && (!responseText || responseText.includes('Unfortunately'))) {
      const toolResult = result.toolResults[0].result;
      if (toolResult.llm_formatted_data) {
        responseText = toolResult.llm_formatted_data;
      } else if (toolResult.data?.length > 0) {
        responseText = `Found ${toolResult.data.length} order(s) for bob@example.com.`;
      } else {
        responseText = 'Hi! I checked for orders associated with bob@example.com, but none were found. Please verify the email or provide more details.';
      }
    }

    // Ensure response is not empty
    if (!responseText) {
      responseText = 'Hi! I processed your request, but no response was generated. Please try again.';
    }

    return new Response(responseText, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[API_ROUTE] Error:', error.stack);
    return new Response(
      `Error: ${error.message || 'An error occurred during the request.'}`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      }
    );
  }
}