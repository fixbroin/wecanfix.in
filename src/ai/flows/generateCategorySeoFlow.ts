'use server';
/**
 * @fileOverview An AI flow to generate SEO content for a service category.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateCategorySeoInputSchema = z.object({
  categoryName: z.string().describe("The name of the service category, e.g., 'Carpentry' or 'Appliance Repair'."),
});
export type GenerateCategorySeoInput = z.infer<typeof GenerateCategorySeoInputSchema>;

const GenerateCategorySeoOutputSchema = z.object({
  h1_title: z.string().describe("An H1 title optimized for the category page. Format: '{{categoryName}} Services Near You – Professional & Trusted'"),
  seo_title: z.string().describe("An SEO-optimized meta title, under 60 characters. Format: '{{categoryName}} Services | Book Online | Wecanfix'"),
  seo_description: z.string().describe("An SEO-optimized meta description, under 160 characters. Should be a compelling summary that encourages clicks, mentioning key services relevant to the category."),
  seo_keywords: z.string().describe("A comma-separated string of 10 relevant SEO keywords for the category. Must include variations like '{{categoryName}} services', 'book {{categoryName}}', '{{categoryName}} near me', and specific related services."),
  imageHint: z.string().describe("One or two keywords for an AI image search for the category's main image. E.g., 'carpentry tools' or 'clean appliances'. Max 50 characters."),
});
export type GenerateCategorySeoOutput = z.infer<typeof GenerateCategorySeoOutputSchema>;

export async function generateCategorySeo(input: GenerateCategorySeoInput): Promise<GenerateCategorySeoOutput> {
  return generateCategorySeoFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateCategorySeoPrompt',
  input: { schema: GenerateCategorySeoInputSchema },
  output: { schema: GenerateCategorySeoOutputSchema },
  prompt: `You are an expert SEO copywriter for a home services company called "Wecanfix".
Your task is to generate optimized SEO content for a specific service category page.

Category Name: {{categoryName}}

Based on this detail, please generate the following content. Be professional, clear, and focused on attracting customers.

1.  **h1_title**: Create an H1 title with the format: "{{categoryName}} Services Near You – Professional & Trusted".
2.  **seo_title**: A meta title (under 60 chars) with the format: "{{categoryName}} Services | Book Online | Wecanfix".
3.  **seo_description**: A compelling meta description (under 160 chars) that includes the category and encourages bookings.
4.  **seo_keywords**: A comma-separated string of 10 relevant keywords. Include "{{categoryName}} services", "{{categoryName}} near me", and other related local terms.
5.  **imageHint**: Provide one or two keywords for an AI image search for the category's main image. Max 50 characters.

Return the entire response as a single, valid JSON object that adheres to the defined output schema.
`,
});

const generateCategorySeoFlow = ai.defineFlow(
  {
    name: 'generateCategorySeoFlow',
    inputSchema: GenerateCategorySeoInputSchema,
    outputSchema: GenerateCategorySeoOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error("AI failed to generate a valid SEO response for the category.");
    }
    return output;
  }
);
