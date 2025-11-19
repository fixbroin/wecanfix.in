
'use server';
/**
 * @fileOverview An AI flow to generate SEO content for a specific service area within a city.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateAreaSeoInputSchema = z.object({
  areaName: z.string().describe("The name of the specific area or locality, e.g., 'Whitefield'."),
  cityName: z.string().describe("The name of the parent city, e.g., 'Bangalore'."),
});
export type GenerateAreaSeoInput = z.infer<typeof GenerateAreaSeoInputSchema>;

const GenerateAreaSeoOutputSchema = z.object({
  h1_title: z.string().describe("An H1 title optimized for the area page. Format: 'Top Home Services in {{areaName}} – Wecanfix Near You'"),
  seo_title: z.string().describe("An SEO-optimized meta title, under 60 characters. Format: '{{areaName}} Home Services – Electrician, Plumber, Carpenter Near Me'"),
  seo_description: z.string().describe("An SEO-optimized meta description, under 160 characters. Should be a compelling summary that encourages clicks, mentioning the area, parent city, and key services."),
  seo_keywords: z.string().describe("A comma-separated string of 10 relevant SEO keywords for the area. Must include variations like '{{areaName}} home services', 'electrician in {{areaName}}', 'plumber near {{areaName}}', 'carpenter near me', and 'home repair {{areaName}}'."),
});
export type GenerateAreaSeoOutput = z.infer<typeof GenerateAreaSeoOutputSchema>;

export async function generateAreaSeo(input: GenerateAreaSeoInput): Promise<GenerateAreaSeoOutput> {
  return generateAreaSeoFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateAreaSeoPrompt',
  input: { schema: GenerateAreaSeoInputSchema },
  output: { schema: GenerateAreaSeoOutputSchema },
  prompt: `You are an expert SEO copywriter for a home services company called "Wecanfix".
Your task is to generate optimized SEO content for a specific service area within a city.

Area Name: {{areaName}}
City Name: {{cityName}}

Based on these details, please generate the following content. Be professional, clear, and hyper-locally focused.

1.  **h1_title**: An H1 title using the format: "Top Home Services in {{areaName}} – Wecanfix Near You".
2.  **seo_title**: A meta title (under 60 chars) with the format: "{{areaName}} Home Services – Electrician, Plumber, Carpenter Near Me".
3.  **seo_description**: A meta description (under 160 chars) that is compelling and includes the area, city, and key services.
4.  **seo_keywords**: A comma-separated string of 10 relevant keywords. Include "{{areaName}} home services", "electrician in {{areaName}}", "plumber near {{areaName}}", "carpenter near me", and "home repair {{areaName}}".

Return the entire response as a single, valid JSON object that adheres to the defined output schema.
`,
});

const generateAreaSeoFlow = ai.defineFlow(
  {
    name: 'generateAreaSeoFlow',
    inputSchema: GenerateAreaSeoInputSchema,
    outputSchema: GenerateAreaSeoOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error("AI failed to generate a valid SEO response for the area.");
    }
    return output;
  }
);
