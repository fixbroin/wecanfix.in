'use server';
/**
 * @fileOverview An AI flow to generate comprehensive blog content and SEO metadata for home services in HTML format.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateBlogContentInputSchema = z.object({
  title: z.string().describe("The title of the blog post to generate content for."),
  categoryName: z.string().optional().describe("The optional category name for more specific SEO generation (e.g., Carpentry, Plumber, Electrician)."),
  currentYear: z.string().optional().describe("The current year for dynamic content generation."),
});
export type GenerateBlogContentInput = z.infer<typeof GenerateBlogContentInputSchema>;

const GenerateBlogContentOutputSchema = z.object({
  content: z.string().describe("The full blog post content, formatted in HTML with <h2>, <p>, <br>, and <ul> tags. Should be engaging, professional, and at least 400 words, aimed at homeowners. Include 5-7 sections with headers, benefits, service lists, tips, pricing estimates, and a footer with keywords."),
  excerpt: z.string().describe("A short, catchy summary of the blog post (max 150 characters) to be used on the blog list card."),
  tags: z.string().describe("A comma-separated string of 3-5 relevant tags for the post (e.g., 'Maintenance, DIY, Plumbing')."),
  readingTime: z.string().describe("Estimated reading time, e.g., '5 min' or '8 min'."),
  h1_title: z.string().describe("An H1 title with the exact format: '{Title Name} Service Near You | Wecanfix'"),
  meta_title: z.string().describe("A meta title with the format: '{Title Name} Near Me {Category Name} Near Me' or '{Title Name} | Home Services Near Me' if no category is provided."),
  meta_description: z.string().describe("An SEO-optimized meta description, under 160 characters, including relevant service keywords (e.g., Carpentry, Plumber, Electrician, Home Cleaning)."),
  meta_keywords: z.string().describe("A comma-separated string of SEO keywords, including the title, Bangalore, and service keywords like Carpentry near me, Plumber near me, etc."),
  imageHint: z.string().describe("One or two keywords for an AI image search for the blog's cover image. E.g., 'professional electrician' or 'home cleaning'. Max 50 characters."),
});
export type GenerateBlogContentOutput = z.infer<typeof GenerateBlogContentOutputSchema>;

export async function generateBlogContent(input: Omit<GenerateBlogContentInput, 'currentYear'>): Promise<GenerateBlogContentOutput> {
  const currentYear = new Date().getFullYear().toString();
  return generateBlogContentFlow({ ...input, currentYear });
}

const prompt = ai.definePrompt({
  name: 'generateHomeServicesBlogPrompt',
  input: { schema: GenerateBlogContentInputSchema },
  output: { schema: GenerateBlogContentOutputSchema },
  prompt: `You are an expert Local SEO copywriter for a home services company called "Wecanfix" based in Bangalore. Your goal is to write a blog post that ranks #1 on Google for home services in Bangalore.

The content must be formatted in HTML using <h2> for headers, <p> for paragraphs, <br> for line breaks, and <ul> with <li> for lists. Do not use markdown symbols.

**Input Details:**
- Blog Post Title: {{title}}
- Category (optional): {{categoryName}}
- Current Year: {{currentYear}}

**Instructions:**
Generate highly aggressive, intent-driven content based on the following:

1. **content**: Write a masterpiece of at least 600 words. Use an authoritative yet helpful tone.
   - Use aggressive keywords like "Best", "Professional", "Top-Rated", and "Trusted" naturally throughout.
   - Mention Bangalore neighborhoods like Koramangala, Whitefield, Indiranagar, HSR Layout, and Electronic City.
   - Structure:
     - <h2><strong>Introduction</strong>: Why Wecanfix provides the best {{title}} in Bangalore.
     - <h2><strong>Key Benefits of Professional {{categoryName}}</strong>: Focus on quality and safety.
     - <h2><strong>Services We Offer in Bangalore</strong>: Use <ul> with <li>.
     - <h2><strong>Why Choose Wecanfix?</strong>: Highlight 30-minute doorstep service.
     - <h2><strong>Pricing in Bangalore ({{currentYear}})</strong>: Provide a realistic price list for services in Bangalore.
     - <h2><strong>Expert Maintenance Tips</strong>: Practical value for homeowners.
     - <h2><strong>Conclusion</strong>: Call to action to book Wecanfix for {{categoryName}}, Plumbing, Electrical, etc.
   - **Keywords Footer**: An <h2> header 'Local Search Keywords' with a single <p> containing: "{{title}}, best home services Bangalore, {{categoryName}} near me Indiranagar, top-rated professional {{categoryName}} Koramangala, Wecanfix Bangalore, affordable home maintenance Whitefield".

2. **excerpt**: A high-CTR summary (under 150 chars) starting with "Looking for the best...".

3. **tags**: 3-5 tags including "Bangalore, Home Services".

4. **readingTime**: An estimate of how long it takes to read (e.g., "5 min").

5. **h1_title**: Format: "Best Professional {{title}} in Bangalore | Wecanfix".

6. **meta_title**: Format: "Best {{title}} Near Me in Bangalore | Top-Rated {{categoryName}}".

7. **meta_description**: A compelling meta description (under 160 chars) starting with "Hire the best professional experts for {{title}} in Bangalore...".

8. **meta_keywords**: Comma-separated: "{{title}}, Bangalore, Koramangala, Whitefield, best {{categoryName}} near me".

9. **imageHint**: Provide "{{title}} Bangalore professional service" Max 50 characters.

Return the entire response as a single, valid JSON object.
`,
});

const generateBlogContentFlow = ai.defineFlow(
  {
    name: 'generateHomeServicesBlogFlow',
    inputSchema: GenerateBlogContentInputSchema,
    outputSchema: GenerateBlogContentOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error("AI failed to generate a valid blog post response.");
    }
    return output;
  }
);