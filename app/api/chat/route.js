import { streamText } from 'ai';
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

    const result = await streamText({
      model: getLLMModel(),
      system: SYSTEM_PROMPT,
      messages,
      tools: {
        db_query: databaseQueryTool,
      },
      toolChoice: requiresTool ? 'auto' : 'auto', // Changed from 'required' to 'auto' to avoid error
      temperature: isDevelopment() ? 0.7 : 0.5,
    });

    // Return streaming response
    return result.toDataStreamResponse();
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