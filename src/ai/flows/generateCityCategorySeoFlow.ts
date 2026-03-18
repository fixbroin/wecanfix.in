
'use server';
/**
 * @fileOverview An AI flow to generate SEO content for a specific service category within a city.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateCityCategorySeoInputSchema = z.object({
  cityName: z.string().describe("The name of the city, e.g., 'Bangalore'."),
  categoryName: z.string().describe("The name of the service category, e.g., 'Carpentry'."),
});
export type GenerateCityCategorySeoInput = z.infer<typeof GenerateCityCategorySeoInputSchema>;

const GenerateCityCategorySeoOutputSchema = z.object({
  h1_title: z.string().describe("An H1 title optimized for the city-category page. Format: 'Best Professional {{categoryName}} Services in {{cityName}}'"),
  meta_title: z.string().describe("An SEO-optimized meta title, under 60 characters. Format: 'Best {{categoryName}} in {{cityName}} | Professional {{categoryName}} Near Me'"),
  meta_description: z.string().describe("An SEO-optimized meta description, under 160 characters. Should be a compelling summary that encourages clicks, mentioning key services, the city, and 'near me' intent. e.g. 'Hire the best professional {{categoryName}} experts in {{cityName}}...'"),
  meta_keywords: z.string().describe("A comma-separated string of 10 highly relevant local SEO keywords. Must include variations like 'best {{categoryName}} in {{cityName}}', 'professional {{categoryName}} near me', 'top-rated {{categoryName}} {{cityName}}'."),
});
export type GenerateCityCategorySeoOutput = z.infer<typeof GenerateCityCategorySeoOutputSchema>;

export async function generateCityCategorySeo(input: GenerateCityCategorySeoInput): Promise<GenerateCityCategorySeoOutput> {
  return generateCityCategorySeoFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateCityCategorySeoPrompt',
  input: { schema: GenerateCityCategorySeoInputSchema },
  output: { schema: GenerateCityCategorySeoOutputSchema },
  prompt: `You are an expert Local SEO copywriter for a home services company called "Wecanfix".
Your task is to generate highly aggressive, intent-driven SEO content for a specific service category within a city to rank #1 on Google.

City Name: {{cityName}}
Category Name: {{categoryName}}

Based on these details, generate the following content. Focus on high-intent keywords like "Best", "Professional", "Top-Rated", and "Near Me".

1.  **h1_title**: Create an H1 title with the format: "Best Professional {{categoryName}} Services in {{cityName}}".
2.  **meta_title**: A meta title (under 60 chars) with the format: "Best {{categoryName}} in {{cityName}} | Professional {{categoryName}} Near Me".
3.  **meta_description**: A compelling meta description (under 160 chars) that includes the city, category, and words like "trusted experts" or "affordable pricing" to drive high click-through rates.
4.  **meta_keywords**: A comma-separated string of 10 high-intent keywords. Include "best {{categoryName}} {{cityName}}", "professional {{categoryName}} near me", "top-rated {{categoryName}} {{cityName}}", and specific sub-services if applicable.

Return the entire response as a single, valid JSON object that adheres to the defined output schema.
`,
});

const generateCityCategorySeoFlow = ai.defineFlow(
  {
    name: 'generateCityCategorySeoFlow',
    inputSchema: GenerateCityCategorySeoInputSchema,
    outputSchema: GenerateCityCategorySeoOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error("AI failed to generate a valid SEO response for the city-category.");
    }
    return output;
  }
);
