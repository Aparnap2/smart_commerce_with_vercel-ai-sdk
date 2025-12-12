import { streamText } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { databaseQueryTool } from '../../../lib/tools/database';
import { SYSTEM_PROMPT } from './system-prompt';

// Create Ollama provider instance
const ollama = createOllama({
  baseURL: 'http://localhost:11434',
});

export const maxDuration = 30;

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
      console.error('[API_ROUTE_OLLAMA] databaseQueryTool is not correctly configured:', databaseQueryTool);
      return new Response('Internal server error: Tool not configured.', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Use Ollama for local development with streaming
    const result = await streamText({
      model: ollama('ministral-3:3b'),
      system: SYSTEM_PROMPT,
      messages,
      tools: {
        db_query: databaseQueryTool,
      },
      toolChoice: requiresTool ? 'required' : 'auto',
      temperature: 0.5,
    });

    // Return streaming response
    return result.toDataStreamResponse();
  } catch (error) {
    console.error('[API_ROUTE_OLLAMA] Error:', error.stack);
    return new Response(
      `Error: ${error.message || 'An error occurred during the request.'}`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      }
    );
  }
}