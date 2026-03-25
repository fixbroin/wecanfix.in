
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
  fullDescription: z.string().describe("A slightly longer, one-paragraph marketing description for the service detail page. Highlight key benefits like speed, quality, and professionalism. MUST BE UNDER 300 characters."),
  pleaseNote: z.array(z.string()).describe("An array of 2-4 important notes or disclaimers for the customer."),
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
      question: z.string().describe("A frequently asked question about the service. Frame it to capture voice search intent (e.g., 'How much does it cost to...')."),
      answer: z.string().describe("A clear, helpful, and localized answer to the question."),
    })
  ).describe("An array of 3-4 frequently asked questions. These are crucial for 'People Also Ask' rich snippets on Google."),
  seo: z.object({
    h1_title: z.string().describe("An H1 title with the exact format 'Best Professional {{serviceName}}'."),
    seo_title: z.string().describe("An SEO-optimized meta title, under 60 characters, with the format 'Best {{serviceName}} Near Me | Professional {{categoryName}}'."),
    seo_description: z.string().describe("An SEO-optimized meta description, under 160 characters. Should be a compelling summary that encourages clicks using words like 'Top-rated' and 'Affordable'."),
    seo_keywords: z.string().describe("A comma-separated string of 10 relevant SEO keywords. Must include variations like 'best {{serviceName}} near me', 'professional {{categoryName}} services', 'book {{serviceName}} online'."),
  }).describe("SEO related content for the service page."),
  rating: z.coerce.number().min(4.5).max(5).describe("A random rating between 4.5 and 5.0, with one decimal place (e.g., 4.8, 4.9) to boost click-through rates."),
  reviewCount: z.coerce.number().int().min(150).max(1500).describe("A random integer review count between 150 and 1500."),
});
export type GenerateServiceDetailsOutput = z.infer<typeof GenerateServiceDetailsOutputSchema>;

export async function generateServiceDetails(input: GenerateServiceDetailsInput): Promise<GenerateServiceDetailsOutput> {
  return generateServiceDetailsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateServiceDetailsPrompt',
  input: { schema: GenerateServiceDetailsInputSchema },
  output: { schema: GenerateServiceDetailsOutputSchema },
  prompt: `You are an expert Local SEO copywriter for a home services company called "Wecanfix" operating specifically in Bangalore, India. Your task is to generate highly aggressive, intent-driven content and SEO metadata for a specific service to rank #1 on Google for Bangalore-based searches.

Service Name: {{serviceName}}
Category: {{categoryName}}
Sub-Category: {{subCategoryName}}

Please generate the content based on the service details provided. Adhere to the following structure and focus on high-intent keywords like "Best", "Professional", "Top-Rated", "Near Me", and "Bangalore". Ensure the FAQs are designed to win Google's "People Also Ask" boxes and mention Bangalore context where natural.

**EXAMPLE**
For a service named "Digital or Electronic Lock Installation" in the "Carpentry" category:

*   **shortDescription**: "Install one digital or electronic lock on a wooden door in Bangalore."
*   **fullDescription**: "Book skilled, professional carpenters for safe and secure digital lock installation in Bangalore. Trusted by homeowners in HSR Layout, Indiranagar, and Koramangala for quality carpentry services."
*   **pleaseNote**: ["Lock must be provided by the customer", "Installation applicable for standard wooden doors only", "Electrical connection, configuration, or setup beyond installation not included", "Our partners do not carry a ladder; please arrange one if needed"]
*   **imageHint**: "Digital lock installation wooden door"
*   **serviceHighlights**: ["Safe and proper digital lock installation", "Skilled professionals handle delicate fittings", "Labour only, customer provides lock and accessories", "Available across all Bangalore neighborhoods"]
*   **includedItems**: ["Installation of one digital or electronic lock on a wooden door", "Professional carpenter with basic tools", "Physical mounting of the lock", "Service available in all areas of Bangalore"]
*   **excludedItems**: ["Lock supply or purchase assistance", "Installation on metal, glass, PVC, or sliding doors", "Electrical wiring or configuration of smart features"]
*   **taskTime**: { "value": 60, "unit": "minutes" }
*   **serviceFaqs**: [{ "question": "What does the professional digital lock installation service in Bangalore include?", "answer": "The service includes installing one digital or electronic door lock on a wooden door using customer-provided hardware by an expert carpenter across Bangalore." }, { "question": "Do you provide the digital lock?", "answer": "No, the digital or electronic lock must be provided by the customer. We offer top-rated professional installation services in Bangalore." }, { "question": "Can this be installed on any door type?", "answer": "This service is specifically for wooden or engineered wood doors. We currently do not install on metal, glass, or uPVC doors in Bangalore." }]
*   **seo**: {
        "h1_title": "Best Professional Digital or Electronic Lock Installation in Bangalore",
        "seo_title": "Best Digital Lock Installation in Bangalore | Carpenter Near Me",
        "seo_description": "Book top-rated, professional digital lock installation in Bangalore. Secure fitting on wooden doors by expert carpenters. Trusted services in Koramangala, HSR & more.",
        "seo_keywords": "best digital lock installation in bangalore, professional electronic lock fitting bangalore, expert carpenter near me bangalore, smart lock installation services bangalore"
    }
*   **rating**: 4.8
*   **reviewCount**: 452

**INSTRUCTIONS**

Now, using the input service details ({{serviceName}}, {{categoryName}}, {{subCategoryName}}), generate the complete JSON output following the schema. 

1.  **shortDescription**: A concise, one-sentence description. Mention Bangalore if possible. Max 200 chars.
2.  **fullDescription**: A marketing description highlighting "professional" and "top-rated" qualities in the Bangalore context. MUST BE UNDER 300 chars.
3.  **pleaseNote**: An array of 2-4 important notes or disclaimers.
4.  **imageHint**: One or two keywords for an AI image search. Max 50 chars.
5.  **serviceHighlights**: An array of 2-4 short strings highlighting key benefits, including availability in Bangalore.
6.  **includedItems**: An array of 3-5 strings listing what is included.
7.  **excludedItems**: An array of 2-4 strings listing what is NOT included.
8.  **taskTime**: An object with the estimated time to complete the task.
9.  **serviceFaqs**: An array of 3-4 specific question/answer objects designed for voice search and "People Also Ask" boxes, localized for Bangalore.
10. **seo**: An object with SEO content:
    *   **h1_title**: Format: "Best Professional {{serviceName}} in Bangalore".
    *   **seo_title**: Format: "Best {{serviceName}} in Bangalore | Professional {{categoryName}}" (under 60 chars).
    *   **seo_description**: SEO meta description (under 160 chars) mentioning "Bangalore" and top neighborhoods like "Koramangala", "HSR Layout", or "Indiranagar".
    *   **seo_keywords**: 10 comma-separated high-intent keywords including "Bangalore" variations.
11. **rating**: A random float between 4.5 and 5.0 (one decimal place).
12. **reviewCount**: A random integer between 150 and 1500.

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
