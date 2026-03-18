
'use server';
/**
 * @fileOverview An AI flow to generate SEO content for a city page.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateCitySeoInputSchema = z.object({
  cityName: z.string().describe("The name of the city, e.g., 'Bangalore' or 'Whitefield'."),
});
export type GenerateCitySeoInput = z.infer<typeof GenerateCitySeoInputSchema>;

const GenerateCitySeoOutputSchema = z.object({
  h1_title: z.string().describe("An H1 title optimized for the city page. Format: 'Best Professional Home Services in {{cityName}}'"),
  seo_title: z.string().describe("An SEO-optimized meta title, under 60 characters. Format: 'Best Home Services in {{cityName}} | Top-Rated Handyman Near Me'"),
  seo_description: z.string().describe("An SEO-optimized meta description, under 160 characters. Should be a compelling summary that encourages clicks, mentioning key services, the city name, and words like 'trusted' and 'professional'."),
  seo_keywords: z.string().describe("A comma-separated string of 10 relevant SEO keywords for the city. Must include variations like 'best home services {{cityName}}', 'professional home repair {{cityName}}', 'handyman near me'."),
});
export type GenerateCitySeoOutput = z.infer<typeof GenerateCitySeoOutputSchema>;

export async function generateCitySeo(input: GenerateCitySeoInput): Promise<GenerateCitySeoOutput> {
  return generateCitySeoFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateCitySeoPrompt',
  input: { schema: GenerateCitySeoInputSchema },
  output: { schema: GenerateCitySeoOutputSchema },
  prompt: `You are an expert Local SEO copywriter for a home services company called "Wecanfix".
Your task is to generate highly aggressive, intent-driven SEO content for a city-level landing page to rank #1 on Google.

City Name: {{cityName}}

Based on the city name, generate the following content. Focus on high-intent keywords like "Best", "Professional", "Top-Rated", and "Near Me".

1.  **h1_title**: An H1 title using the format: "Best Professional Home Services in {{cityName}}".
2.  **seo_title**: A meta title (under 60 chars) with the format: "Best Home Services in {{cityName}} | Top-Rated Handyman Near Me".
3.  **seo_description**: A meta description (under 160 chars) that is compelling and includes the city name, key services (like carpentry, plumbing), and words like "trusted professionals".
4.  **seo_keywords**: A comma-separated string of 10 high-intent keywords. Include "best home services {{cityName}}", "professional home repair {{cityName}}", and "top handyman near me".

Return the entire response as a single, valid JSON object that adheres to the defined output schema.
`,
});

const generateCitySeoFlow = ai.defineFlow(
  {
    name: 'generateCitySeoFlow',
    inputSchema: GenerateCitySeoInputSchema,
    outputSchema: GenerateCitySeoOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error("AI failed to generate a valid SEO response for the city.");
    }
    return output;
  }
);
