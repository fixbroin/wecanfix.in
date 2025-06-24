
'use server';
/**
 * @fileOverview An AI flow to generate comprehensive details for a home service.
 *
 * - generateServiceDetails - A function that takes a service name and context, and returns generated content.
 * - GenerateServiceDetailsInput - The input type for the flow.
 * - GenerateServiceDetailsOutput - The return type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateServiceDetailsInputSchema = z.object({
  serviceName: z.string().describe("The name of the home service, e.g., 'AC Deep Cleaning' or 'Leaky Faucet Repair'."),
  categoryName: z.string().describe("The main category the service belongs to, e.g., 'Appliance Repair' or 'Plumbing'."),
  subCategoryName: z.string().describe("The specific sub-category, e.g., 'AC Repair' or 'Bathroom Fittings'."),
});
export type GenerateServiceDetailsInput = z.infer<typeof GenerateServiceDetailsInputSchema>;

const GenerateServiceDetailsOutputSchema = z.object({
  shortDescription: z.string().describe("A concise, one-sentence description for the service card. Max 200 characters."),
  fullDescription: z.string().describe("A slightly longer, one-paragraph marketing description for the service detail page. Highlight key benefits. MUST BE UNDER 300 characters."),
  pleaseNote: z.array(z.string()).describe("An array of 2-4 important notes or disclaimers for the customer. For a carpenter, an example would be 'Our partners do not carry a ladder; please arrange one if required.' or 'We use only branded products.'."),
  imageHint: z.string().describe("One or two keywords for an AI image search for the service's main image. E.g., 'plumber fixing' or 'clean kitchen'. Max 50 characters."),
  serviceHighlights: z.array(z.string()).describe("An array of 3-5 short, punchy strings highlighting key features or benefits of the service."),
  includedItems: z.array(z.string()).describe("An array of 3-5 strings listing what is included in the service package."),
  excludedItems: z.array(z.string()).describe("An array of 2-4 strings listing what is NOT included in the service package."),
  taskTime: z.object({
    value: z.number().describe("The estimated time value to complete the task."),
    unit: z.enum(['minutes', 'hours']).describe("The unit of time for the value."),
  }).describe("An estimated time for how long the service task takes."),
  serviceFaqs: z.array(
    z.object({
      question: z.string().describe("A frequently asked question about the service."),
      answer: z.string().describe("A clear and helpful answer to the question."),
    })
  ).describe("An array of 2-3 frequently asked questions and their answers related to this specific service."),
  seo: z.object({
    h1_title: z.string().describe("An H1 title with the exact format '{{serviceName}} Near You'."),
    seo_title: z.string().describe("An SEO-optimized meta title, under 60 characters, with the format '{{serviceName}} Near Me | {{categoryName}} Near Me'."),
    seo_description: z.string().describe("An SEO-optimized meta description, under 160 characters. Should be a compelling summary that encourages clicks."),
    seo_keywords: z.string().describe("A comma-separated string of 10 relevant SEO keywords. Must include variations like '{{serviceName}} near me', '{{serviceName}} near you', '{{categoryName}} near me', and '{{categoryName}} near you'."),
  }).describe("SEO related content for the service page."),
  rating: z.coerce.number().min(4).max(5).describe("A random rating between 4.0 and 5.0, with one decimal place (e.g., 4.3, 4.8)."),
  reviewCount: z.coerce.number().int().min(100).max(1000).describe("A random integer review count between 100 and 1000."),
});
export type GenerateServiceDetailsOutput = z.infer<typeof GenerateServiceDetailsOutputSchema>;

export async function generateServiceDetails(input: GenerateServiceDetailsInput): Promise<GenerateServiceDetailsOutput> {
  return generateServiceDetailsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateServiceDetailsPrompt',
  input: { schema: GenerateServiceDetailsInputSchema },
  output: { schema: GenerateServiceDetailsOutputSchema },
  prompt: `You are an expert copywriter and SEO specialist for a home services company called "FixBro". Your task is to generate comprehensive, compelling, and SEO-friendly content for a specific service.

Service Name: {{serviceName}}
Category: {{categoryName}}
Sub-Category: {{subCategoryName}}

Based on the service details above, please generate the following content. Be professional, clear, and customer-focused.

1.  **shortDescription**: A concise, one-sentence description for a service card. Max 200 chars.
2.  **fullDescription**: A slightly longer, one-paragraph marketing description for the service detail page. Highlight key benefits. It is VERY IMPORTANT that this description is UNDER 300 characters.
3.  **pleaseNote**: An array of 2-4 important notes or disclaimers for the customer. These are things the customer should be aware of before booking. For a carpenter service, an example would be "Our partners do not carry a ladder; please arrange one if required." or "Do not misuse professionals for cleaning, weight lifting, etc.".
4.  **imageHint**: One or two keywords for an AI image search for the service's main image. E.g., 'plumber fixing' or 'clean kitchen'. Max 50 characters.
5.  **serviceHighlights**: An array of 3-5 short, punchy strings highlighting key features.
6.  **includedItems**: An array of 3-5 strings listing what is included.
7.  **excludedItems**: An array of 2-4 strings listing what is NOT included.
8.  **taskTime**: An object with the estimated time to complete the task. Provide a reasonable 'value' and 'unit' (minutes or hours).
9.  **serviceFaqs**: An array of 2-3 relevant question/answer objects about this service.
10. **seo**: An object with SEO content:
    *   **h1_title**: Create an H1 title with the format "{{serviceName}} Near You".
    *   **seo_title**: An SEO meta title (under 60 chars) with the format "{{serviceName}} Near Me | {{categoryName}} Near Me".
    *   **seo_description**: An SEO meta description (under 160 chars).
    *   **seo_keywords**: A comma-separated string of 10 relevant keywords. Include variations like '{{serviceName}} near me', '{{serviceName}} near you', '{{categoryName}} near me', '{{categoryName}} near you', and other related terms.
11. **rating**: A random floating-point number between 4.0 and 5.0, with one decimal place (e.g., 4.3, 4.8).
12. **reviewCount**: A random integer between 100 and 1000.

Return the entire response as a single, valid JSON object that adheres to the defined output schema.
`,
});

const generateServiceDetailsFlow = ai.defineFlow(
  {
    name: 'generateServiceDetailsFlow',
    inputSchema: GenerateServiceDetailsInputSchema,
    outputSchema: GenerateServiceDetailsOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error("AI failed to generate a valid response.");
    }
    return output;
  }
);
