
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
  h1_title: z.string().describe("An H1 title optimized for the area-category page. Format: '{{categoryName}} Services in {{areaName}} – Professional Technicians Near You'"),
  meta_title: z.string().describe("An SEO-optimized meta title, under 60 characters. Format: '{{categoryName}} Services in {{areaName}} | Book Local Experts Near Me'"),
  meta_description: z.string().describe("An SEO-optimized meta description, under 160 characters. Should be a compelling summary that encourages clicks, mentioning the area, category, and key services."),
  meta_keywords: z.string().describe("A comma-separated string of 10 relevant SEO keywords for the area-category combination. Must include variations like '{{categoryName}} services {{areaName}}', '{{areaName}} {{categoryName}}', '{{categoryName}} near me {{areaName}}', and specific services relevant to the category."),
});
export type GenerateAreaCategorySeoOutput = z.infer<typeof GenerateAreaCategorySeoOutputSchema>;

export async function generateAreaCategorySeo(input: GenerateAreaCategorySeoInput): Promise<GenerateAreaCategorySeoOutput> {
  return generateAreaCategorySeoFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateAreaCategorySeoPrompt',
  input: { schema: GenerateAreaCategorySeoInputSchema },
  output: { schema: GenerateAreaCategorySeoOutputSchema },
  prompt: `You are an expert SEO copywriter for a home services company called "Wecanfix".
Your task is to generate optimized, hyper-local SEO content for a specific service category within a specific area of a city.

Area Name: {{areaName}}
City Name: {{cityName}}
Category Name: {{categoryName}}

Based on these details, please generate the following content. Be professional, clear, and focused on this specific neighborhood.

1.  **h1_title**: Create an H1 title with the format: "{{categoryName}} Services in {{areaName}} – Professional Technicians Near You".
2.  **meta_title**: A meta title (under 60 chars) with the format: "{{categoryName}} Services in {{areaName}} | {{categoryName}} Near Me".
3.  **meta_description**: A compelling meta description (under 160 chars) that includes the area, city, and category, encouraging local bookings.
4.  **meta_keywords**: A comma-separated string of 10 relevant keywords. Include "{{categoryName}} services {{areaName}}", "{{areaName}} {{categoryName}}", "{{categoryName}} near me {{areaName}}", and other related local terms.

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
