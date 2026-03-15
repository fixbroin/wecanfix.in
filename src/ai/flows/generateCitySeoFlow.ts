
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
  h1_title: z.string().describe("An H1 title optimized for the city page. Format: 'Best Home Services in {{cityName}} – Expert Technicians Near You'"),
  seo_title: z.string().describe("An SEO-optimized meta title, under 60 characters. Format: 'Home Services in {{cityName}} | Carpentry, Plumbing, Electricians Near Me'"),
  seo_description: z.string().describe("An SEO-optimized meta description, under 160 characters. Should be a compelling summary that encourages clicks, mentioning key services and the city name."),
  seo_keywords: z.string().describe("A comma-separated string of 10 relevant SEO keywords for the city. Must include variations like '{{cityName}} home services', 'home repair {{cityName}}', 'carpentry near me', 'electricians in {{cityName}}', and 'plumbers near you'."),
});
export type GenerateCitySeoOutput = z.infer<typeof GenerateCitySeoOutputSchema>;

export async function generateCitySeo(input: GenerateCitySeoInput): Promise<GenerateCitySeoOutput> {
  return generateCitySeoFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateCitySeoPrompt',
  input: { schema: GenerateCitySeoInputSchema },
  output: { schema: GenerateCitySeoOutputSchema },
  prompt: `You are an expert SEO copywriter for a home services company called "Wecanfix".
Your task is to generate optimized SEO content for a city-level landing page.

City Name: {{cityName}}

Based on the city name, please generate the following content. Be professional, clear, and focused on attracting local customers.

1.  **h1_title**: An H1 title using the format: "Best Home Services in {{cityName}} – Expert Technicians Near You".
2.  **seo_title**: A meta title (under 60 chars) with the format: "Home Services in {{cityName}} | Carpentry, Plumbing, Electricians Near Me".
3.  **seo_description**: A meta description (under 160 chars) that is compelling and includes the city name and key services like carpentry, plumbing, and electrical.
4.  **seo_keywords**: A comma-separated string of 10 relevant keywords. Include "{{cityName}} home services", "home repair {{cityName}}", and service-specific terms with location modifiers like "near me" or "in {{cityName}}".

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
