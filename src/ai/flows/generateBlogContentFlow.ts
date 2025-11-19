'use server';
/**
 * @fileOverview An AI flow to generate comprehensive blog content and SEO metadata for home services in HTML format.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateBlogContentInputSchema = z.object({
  title: z.string().describe("The title of the blog post to generate content for."),
  categoryName: z.string().optional().describe("The optional category name for more specific SEO generation (e.g., Carpentry, Plumber, Electrician)."),
});
export type GenerateBlogContentInput = z.infer<typeof GenerateBlogContentInputSchema>;

const GenerateBlogContentOutputSchema = z.object({
  content: z.string().describe("The full blog post content, formatted in HTML with <h2>, <p>, <br>, and <ul> tags. Should be engaging, professional, and at least 400 words, aimed at homeowners. Include 5-7 sections with headers, benefits, service lists, tips, pricing estimates, and a footer with keywords."),
  h1_title: z.string().describe("An H1 title with the exact format: '{Title Name} Service Near You | Wecanfix'"),
  meta_title: z.string().describe("A meta title with the format: '{Title Name} Near Me {Category Name} Near Me' or '{Title Name} | Home Services Near Me' if no category is provided."),
  meta_description: z.string().describe("An SEO-optimized meta description, under 160 characters, including relevant service keywords (e.g., Carpentry, Plumber, Electrician, Home Cleaning)."),
  meta_keywords: z.string().describe("A comma-separated string of SEO keywords, including the title, Bangalore, and service keywords like Carpentry near me, Plumber near me, etc."),
  imageHint: z.string().describe("One or two keywords for an AI image search for the blog's cover image. E.g., 'professional electrician' or 'home cleaning'. Max 50 characters."),
});
export type GenerateBlogContentOutput = z.infer<typeof GenerateBlogContentOutputSchema>;

export async function generateBlogContent(input: GenerateBlogContentInput): Promise<GenerateBlogContentOutput> {
  return generateBlogContentFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateHomeServicesBlogPrompt',
  input: { schema: GenerateBlogContentInputSchema },
  output: { schema: GenerateBlogContentOutputSchema },
  prompt: `You are an expert SEO copywriter for a home services company called "Wecanfix" based in Bangalore. Your task is to generate an engaging, professional, and informative blog post with SEO metadata based on a given title and an optional category. The content must be formatted in HTML using <h2> for headers, <p> for paragraphs, <br> for line breaks, and <ul> with <li> for lists, matching the style of the provided examples. Do not use markdown symbols (e.g., '#', '**', '!'). Do not reference competitors like Urban Company or NoBroker.

**Input Details:**
- Blog Post Title: {{title}}
- Category (optional): {{categoryName}}

**Instructions:**
Generate the following content based on the input details.

1. **content**: Write an engaging blog post of at least 500 words aimed at homeowners. Use a professional, approachable tone. Structure the content with 5-7 sections, each with a clear <h2> header (e.g., 'Why Choose Professional Services', 'Common Mistakes to Avoid'). Include:
   - An introductory section explaining the importance of the service and why DIY can be risky, wrapped in <h2> and <p> tags.
   - A section on key benefits of professional services (e.g., quality, efficiency, safety), using <p> tags with <strong> for numbered or titled points, separated by <br>.
   - A section listing common services related to the title or category, using a <ul> with <li> tags starting with '✔️'.
   - A section on choosing the right service provider, with tips like checking reviews or verifying experience, using <p> tags with <strong> for points.
   - A section with typical pricing estimates for 2025 in Bangalore (e.g., ₹100–₹500 for specific tasks), formatted in a <ul> with <li> tags.
   - A section with practical DIY tips or common mistakes to avoid, using a <ul> with <li> tags starting with '✔️'.
   - A concluding section encouraging readers to book Wecanfix’s professional services, mentioning other services like Carpentry, Plumber, Electrician, etc., wrapped in <h2> and <p> tags.
   - A final footer section titled 'Related Services and Keywords' under an <h2> header, containing a single <p> tag with a comma-separated list of keywords in the exact format: "{{title}}, Bangalore, Carpentry near me, Plumber near me, Electrician near me, Home Cleaning near me, Painting near me, TV Installation near me, Interior Design near me, Website Design near me".
   - Use <br> tags between sections for spacing, as in the examples.
   - Incorporate Bangalore-specific references (e.g., local markets like Whitefield or general mentions of Wecanfix’s services in Bangalore) without mentioning competitors like Urban Company or NoBroker.

2. **h1_title**: Create an H1 title with the exact format: "{{title}} Service Near You | Wecanfix".

3. **meta_title**:
   - If a category is provided, use the format: "{{title}} Near Me | {{categoryName}} Near Me" (under 60 chars).
   - If no category is provided, use: "{{title}} Near Me | Home Services Near Me" (under 60 chars).

4. **meta_description**: Write a compelling meta description  related to the blog title. Include 1-2 service keywords (e.g., Carpentry, Plumber, Electrician, Home Cleaning, Painting, TV Installation, Interior Design, Website Design) (under 160 characters).

5. **meta_keywords**: Create a comma-separated string with the format: "{{title}}, Bangalore, Carpentry near me, Plumber near me, Electrician near me, Home Cleaning near me, Painting near me, TV Installation near me, Interior Design near me, Website Design near me".

6. **imageHint**: Provide, "{{title}} for the blog's cover image Max 50 characters.

**Guidelines for Content:**
- Match the style of the provided examples: use <h2><strong> for headers, <p> for paragraphs, <ul><li> for lists with '✔️' prefixes, and <br> for spacing.
- Use a conversational yet professional tone, addressing homeowners directly.
- Include practical advice, such as how to prepare for a service or what to look for in a provider.
- Ensure pricing estimates are realistic for Bangalore in 2025 and formatted as a list.
- Avoid technical jargon unless explained simply for homeowners.
- Reference Wecanfix services and other offerings (e.g., Carpentry, Plumber) in the conclusion.
- Ensure HTML tags are properly closed and content is valid for rendering.
- Include the footer section with the exact keyword format as specified, under an <h2><strong> header titled 'Related Services and Keywords'.
- Do not mention competitors like Urban Company or NoBroker in any section.

Return the entire response as a single, valid JSON object that adheres to the defined output schema.
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