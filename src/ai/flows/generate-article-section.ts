
'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating ONE specific section of a news article
 *              in a conversational Nigerian style, focusing on emotional intelligence and SEO.
 *
 * - generateSingleArticleSection - Generates content for a single section based on the overall title,
 *                                   focus key phrase, the specific section topic/heading, and previous context if needed.
 * - GenerateSingleArticleSectionInput - The input type for the function.
 * - GenerateSingleArticleSectionOutput - The output type for the function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const GenerateSingleArticleSectionInputSchema = z.object({
  title: z.string().describe('The overall title of the news article.'),
  focusKeyPhrase: z.string().describe('The main focus key phrase for the entire article.'),
  sectionTopic: z.string().describe('The specific heading or topic for THIS section from the outline.'),
  sectionIndex: z.number().describe('The index (0-based) of the current section being generated.'),
  totalSections: z.number().describe('The total number of sections in the outline.'),
  previousSectionsContent: z.string().optional().describe('Content of the previously generated sections for context (optional).'), // Added optional context
});
export type GenerateSingleArticleSectionInput = z.infer<
  typeof GenerateSingleArticleSectionInputSchema
>;

const GenerateSingleArticleSectionOutputSchema = z.object({
  sectionContent: z
    .string()
    .describe('The generated content for the specified article section.'),
});
export type GenerateSingleArticleSectionOutput = z.infer<
  typeof GenerateSingleArticleSectionOutputSchema
>;

export async function generateSingleArticleSection(
  input: GenerateSingleArticleSectionInput
): Promise<GenerateSingleArticleSectionOutput> {
  return generateSingleArticleSectionFlow(input);
}

// Updated prompt to match the user's specific instructions for iterative section generation.
const prompt = ai.definePrompt({
  name: 'generateSingleArticleSectionPrompt',
  input: {
    schema: GenerateSingleArticleSectionInputSchema, // Use the full schema including index and context
  },
  output: {
    schema: GenerateSingleArticleSectionOutputSchema,
  },
  // Updated prompt reflecting Nigerian conversational style, tone, iterative instructions, and context awareness.
  prompt: `I need you to focus writing only one section at a time to write the actual content of this investigative journalism report article.
The article title is: "{{{title}}}".
The main focus key phrase is: "{{{focusKeyPhrase}}}".

We are currently working on section number {{add sectionIndex 1}} of {{totalSections}}.
The topic for THIS specific section is: "{{{sectionTopic}}}".

{{#if previousSectionsContent}}
For context, here is the content written for the previous section(s):
---
{{{previousSectionsContent}}}
---
{{/if}}

Now, write ONLY the content for the section "{{{sectionTopic}}}".
You're going to write in a one-to-one conversational tone. Write it in a slang and phrases the way Nigerians will talk to each other.
Ensure that your emotionally intelligent with your content and also no filler words. Biko!
We're writing for our targeted audience to meet their search intentionally that it happens to the focused key phrase "{{{focusKeyPhrase}}}" if it makes sense for this particular section.
It's important that you are sure that your writing style possesses character and personality.

Do NOT add any introductory or concluding remarks for the whole article. Just the content for "{{{sectionTopic}}}".
I will let you know before you go to the next section.

Content for Section "{{{sectionTopic}}}":`,
});


const generateSingleArticleSectionFlow = ai.defineFlow<
  typeof GenerateSingleArticleSectionInputSchema,
  typeof GenerateSingleArticleSectionOutputSchema
>(
  {
    name: 'generateSingleArticleSectionFlow',
    inputSchema: GenerateSingleArticleSectionInputSchema,
    outputSchema: GenerateSingleArticleSectionOutputSchema,
  },
  async input => {
    // Add a helper for Handlebars (make sure genkit supports this or pre-process)
    // Note: Handlebars helper registration isn't directly shown in genkit examples,
    // assuming simple {{add index 1}} works or might need adjustment based on actual Handlebars setup.
    // If not supported directly, calculate 'displayIndex: input.sectionIndex + 1' and pass it to prompt.
    const displayIndex = input.sectionIndex + 1;
    const promptInput = {...input, displayIndex}; // Pass calculated index if needed

    const {output} = await prompt(promptInput); // Pass potentially adjusted input
     // Ensure the output is not null or undefined before returning
    if (!output || !output.sectionContent) {
        throw new Error('Failed to generate article section content.');
    }
    return output;
  }
);

// Register Handlebars helper if possible (this might need to be done where Handlebars is configured)
// Handlebars.registerHelper('add', function(a, b) {
//   return a + b;
// });
// Note: Genkit might not expose Handlebars instance directly. Pre-calculation (as shown above) is safer.
