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
  previousSectionsContent: z.string().optional().describe('Content of the previously generated sections for context (optional).'),
  isFirstSection: z.boolean().describe('Indicates if this is the very first section being generated (to use the detailed initial prompt).'),
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


// Define two prompts: one detailed for the first section, one simpler for subsequent ones.
const firstSectionPrompt = ai.definePrompt({
  name: 'generateFirstArticleSectionPrompt',
  input: {
    schema: GenerateSingleArticleSectionInputSchema,
  },
  output: {
    schema: GenerateSingleArticleSectionOutputSchema,
  },
  // Detailed prompt for the first section
  prompt: `I need you to focus writing only one section at a time to write the actual content of this investigative journalism report article.
The article title is: "{{{title}}}".
The main focus key phrase is: "{{{focusKeyPhrase}}}".

We are starting with the **first** section (section 1 of {{totalSections}}).
The topic for THIS first section is: "{{{sectionTopic}}}".

Write ONLY the content for this first section "{{{sectionTopic}}}".
You're going to write in a one-to-one conversational tone. Write it in a slang and phrases the way Nigerians will talk to each other.
Ensure that your emotionally intelligent with your content and also no filler words. Biko!
We're writing for our targeted audience to meet their search intentionally that it happens to be the focused key phrase "{{{focusKeyPhrase}}}" if it makes sense for this particular section.
It's important that you are sure that your writing style possesses character and personality.

Do NOT add any introductory or concluding remarks for the whole article. Just the content for "{{{sectionTopic}}}".
I will let you know before you go to the next section.

Content for Section "{{{sectionTopic}}}":`,
});

const subsequentSectionPrompt = ai.definePrompt({
  name: 'generateSubsequentArticleSectionPrompt',
  input: {
    schema: GenerateSingleArticleSectionInputSchema, // Still needs all context
  },
  output: {
    schema: GenerateSingleArticleSectionOutputSchema,
  },
  // Simpler prompt for subsequent sections, relying on context and previous style
  prompt: `Ok, let's continue with the article titled "{{{title}}}".
Focus Key Phrase: "{{{focusKeyPhrase}}}".

We are now working on section number {{add sectionIndex 1}} of {{totalSections}}.
The topic for THIS specific section is: "{{{sectionTopic}}}".

{{#if previousSectionsContent}}
For context and to maintain the conversational Nigerian style, here is the content written so far:
---
{{{previousSectionsContent}}}
---
{{/if}}

Now, **go on to the next section now**: write ONLY the content for "{{{sectionTopic}}}".
Maintain the established conversational Nigerian tone, emotional intelligence, use of slang/phrases, and focus on the key phrase "{{{focusKeyPhrase}}}" where relevant for this section. Avoid filler words. Keep the personality!

Do NOT add any introductory or concluding remarks for the whole article. Just the content for "{{{sectionTopic}}}".

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
    // Pre-calculate display index for Handlebars
    const displayIndex = input.sectionIndex + 1;
    const promptInput = {...input, displayIndex}; // Pass calculated index

    // Choose the appropriate prompt based on whether it's the first section
    const selectedPrompt = input.isFirstSection ? firstSectionPrompt : subsequentSectionPrompt;

    const {output} = await selectedPrompt(promptInput);

    // Ensure the output is not null or undefined before returning
    if (!output || !output.sectionContent) {
        throw new Error('Failed to generate article section content.');
    }
    return output;
  }
);

// Helper registration is tricky with Genkit's serverless nature.
// Pre-calculating values like `displayIndex` and passing them in the input
// is the most reliable approach instead of relying on Handlebars helpers.
// The `{{add sectionIndex 1}}` syntax might work if Genkit's Handlebars setup includes it,
// but pre-calculation is safer. We added `displayIndex` to the `promptInput`.