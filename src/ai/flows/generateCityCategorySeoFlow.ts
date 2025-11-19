
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
  h1_title: z.string().describe("An H1 title optimized for the city-category page. Format: 'Best {{categoryName}} Services Near You in {{cityName}} – Book Expert Technicians'"),
  meta_title: z.string().describe("An SEO-optimized meta title, under 60 characters. Format: '{{categoryName}} Services in {{cityName}} | {{categoryName}} Near Me'"),
  meta_description: z.string().describe("An SEO-optimized meta description, under 160 characters. Should be a compelling summary that encourages clicks, mentioning key services within the category and the city."),
  meta_keywords: z.string().describe("A comma-separated string of 10 relevant SEO keywords for the city-category combination. Must include variations like '{{categoryName}} services {{cityName}}', '{{categoryName}} in {{cityName}}', '{{categoryName}} near me', and specific services if applicable (e.g., 'furniture repair bangalore' for Carpentry)."),
});
export type GenerateCityCategorySeoOutput = z.infer<typeof GenerateCityCategorySeoOutputSchema>;

export async function generateCityCategorySeo(input: GenerateCityCategorySeoInput): Promise<GenerateCityCategorySeoOutput> {
  return generateCityCategorySeoFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateCityCategorySeoPrompt',
  input: { schema: GenerateCityCategorySeoInputSchema },
  output: { schema: GenerateCityCategorySeoOutputSchema },
  prompt: `You are an expert SEO copywriter for a home services company called "Wecanfix".
Your task is to generate optimized SEO content for a specific service category within a city.

City Name: {{cityName}}
Category Name: {{categoryName}}

Based on these details, please generate the following content. Be professional, clear, and focused on attracting local customers for this specific service category.

1.  **h1_title**: Create an H1 title with the format: "Best {{categoryName}} Services Near You in {{cityName}} – Book Expert Technicians".
2.  **meta_title**: A meta title (under 60 chars) with the format: "{{categoryName}} Services in {{cityName}} | {{categoryName}} Near Me".
3.  **meta_description**: A compelling meta description (under 160 chars) that includes the city, category, and encourages bookings for related services.
4.  **meta_keywords**: A comma-separated string of 10 relevant keywords. Include "{{categoryName}} services {{cityName}}", "{{categoryName}} in {{cityName}}", "{{categoryName}} near me", and other related terms.

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
