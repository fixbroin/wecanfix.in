

'use server';
/**
 * @fileOverview A Genkit flow for an AI chat agent.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { Message } from "genkit/experimental/ai";

// Define the schema for the chat history item
const ChatHistoryItemSchema = z.object({
  role: z.enum(['user', 'model', 'system', 'tool']),
  content: z.array(z.object({ text: z.string() })),
});
export type ChatHistoryItem = z.infer<typeof ChatHistoryItemSchema>;

// Define the input schema for the chat agent flow
const ChatAgentInputSchema = z.object({
  history: z.array(ChatHistoryItemSchema).describe("The chat history between the user and the AI model."),
  message: z.string().describe("The latest message from the user."),
});
export type ChatAgentInput = z.infer<typeof ChatAgentInputSchema>;

// Define the output schema for the chat agent flow
const ChatAgentOutputSchema = z.object({
  response: z.string().describe("The AI-generated response to the user's message."),
});
export type ChatAgentOutput = z.infer<typeof ChatAgentOutputSchema>;

// The main function to be called from the frontend chat component
export async function chatWithAgent(input: ChatAgentInput): Promise<ChatAgentOutput> {
  return chatAgentFlow(input);
}

const systemPrompt = `You are a helpful and friendly customer support assistant for a home services company named "FixBro".

Your goal is to assist users with their inquiries about the services offered.
- Be polite, professional, and concise.
- If you know the answer based on general knowledge of home services (e.g., plumbing, electrical, carpentry, cleaning), provide it.
- If a user asks about pricing, scheduling, or specific company policies you don't know, politely inform them that a human support agent will be with them shortly to provide accurate details.
- If the user's message is unclear or irrelevant to home services, ask for clarification or state that you can only help with home service inquiries.
- Do not make up information you don't know. It is better to defer to a human agent.
- Keep your responses relatively short and easy to read.
`;

const chatAgentFlow = ai.defineFlow(
  {
    name: 'chatAgentFlow',
    inputSchema: ChatAgentInputSchema,
    outputSchema: ChatAgentOutputSchema,
  },
  async (input) => {
    const { history, message } = input;
    
    // Manually construct the prompt string for the ai.generate() API.
    // This model expects a single string, not a structured role-based array.
    let fullPrompt = systemPrompt + "\n\n";

    history.forEach(item => {
      const role = item.role === 'user' ? 'USER' : 'MODEL';
      const text = item.content.map(c => c.text).join(' '); // Flatten content parts
      fullPrompt += `${role}: ${text}\n`;
    });

    fullPrompt += `USER: ${message}\nMODEL:`;

    const response = await ai.generate({
      model: 'googleai/gemini-2.0-flash',
      prompt: fullPrompt,
      config: {
        temperature: 0.5,
      },
    });

    return {
      response: response.text,
    };
  }
);
