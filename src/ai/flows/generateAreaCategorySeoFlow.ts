
'use server';
/**
 * @fileOverview An AI flow to generate SEO content for a specific service category within a specific area of a city.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateAreaCategorySeoInputSchema = z.object({
  areaName: z.string().describe("The name of the specific area or locality, e.g., 'Whitefield'."),
  cityName: z.string().describe("The name of the parent city, e.g., 'Bangalore'."),
  categoryName: z.string().describe("The name of the service category, e.g., 'Carpentry'."),
});
export type GenerateAreaCategorySeoInput = z.infer<typeof GenerateAreaCategorySeoInputSchema>;

const GenerateAreaCategorySeoOutputSchema = z.object({
  h1_title: z.string().describe("An H1 title optimized for the area-category page. Format: 'Best Professional {{categoryName}} Services in {{areaName}}, {{cityName}}'"),
  meta_title: z.string().describe("An SEO-optimized meta title, under 60 characters. Format: 'Best {{categoryName}} in {{areaName}}, {{cityName}} | Expert {{categoryName}} Near Me'"),
  meta_description: z.string().describe("An SEO-optimized meta description, under 160 characters. Should be a compelling summary that encourages clicks, mentioning the area, city, and words like 'top-rated' and 'trusted experts'."),
  meta_keywords: z.string().describe("A comma-separated string of 10 highly relevant hyper-local SEO keywords. Must include variations like 'best {{categoryName}} in {{areaName}}', 'professional {{categoryName}} near me', 'top-rated {{categoryName}} {{areaName}} {{cityName}}'."),
});
export type GenerateAreaCategorySeoOutput = z.infer<typeof GenerateAreaCategorySeoOutputSchema>;

export async function generateAreaCategorySeo(input: GenerateAreaCategorySeoInput): Promise<GenerateAreaCategorySeoOutput> {
  return generateAreaCategorySeoFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateAreaCategorySeoPrompt',
  input: { schema: GenerateAreaCategorySeoInputSchema },
  output: { schema: GenerateAreaCategorySeoOutputSchema },
  prompt: `You are an expert Local SEO copywriter for a home services company called "Wecanfix" operating specifically in Bangalore, India.
Your task is to generate highly aggressive, intent-driven SEO content for a specific service category within a specific neighborhood or area of Bangalore to rank #1 on Google for hyper-local searches.

Area Name: {{areaName}}
City Name: {{cityName}}
Category Name: {{categoryName}}

Based on these details, generate the following content. Focus on high-intent keywords like "Best", "Professional", "Top-Rated", "Near Me", and "Bangalore".

1.  **h1_title**: Create an H1 title with the format: "Best Professional {{categoryName}} Services in {{areaName}}, Bangalore".
2.  **meta_title**: A meta title (under 60 chars) with the format: "Best {{categoryName}} in {{areaName}} | Top-Rated Experts in Bangalore".
3.  **meta_description**: A compelling meta description (under 160 chars) that includes Bangalore, the area ({{areaName}}), and the category. Use hyper-local phrases like "trusted by homeowners in {{areaName}}" or "best {{categoryName}} near me in {{areaName}}".
4.  **meta_keywords**: A comma-separated string of 10 high-intent keywords. Include "best {{categoryName}} {{areaName}} bangalore", "professional {{categoryName}} near me {{areaName}}", "{{areaName}} local {{categoryName}} specialists".

Return the entire response as a single, valid JSON object that adheres to the defined output schema.
`,
});

const generateAreaCategorySeoFlow = ai.defineFlow(
  {
    name: 'generateAreaCategorySeoFlow',
    inputSchema: GenerateAreaCategorySeoInputSchema,
    outputSchema: GenerateAreaCategorySeoOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error("AI failed to generate a valid SEO response for the area-category.");
    }
    return output;
  }
);
