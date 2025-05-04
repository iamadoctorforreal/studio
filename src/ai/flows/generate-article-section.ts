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
  // Added displayIndex to be passed to the prompt
  displayIndex: z.number().describe('The human-readable index (1-based) of the current section.'),
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
  input: Omit<GenerateSingleArticleSectionInput, 'displayIndex'> // Exclude displayIndex from external caller input
): Promise<GenerateSingleArticleSectionOutput> {
   // Calculate displayIndex inside the wrapper before calling the flow
   const displayIndex = input.sectionIndex + 1;
   const flowInput = {...input, displayIndex};
  return generateSingleArticleSectionFlow(flowInput);
}


// Define two prompts: one detailed for the first section, one simpler for subsequent ones.
const firstSectionPrompt = ai.definePrompt({
  name: 'generateFirstArticleSectionPrompt',
  input: {
    schema: GenerateSingleArticleSectionInputSchema, // Includes displayIndex now
  },
  output: {
    schema: GenerateSingleArticleSectionOutputSchema,
  },
  // Detailed prompt for the first section
  prompt: `I need you to focus writing only one section at a time to write the actual content of this investigative journalism report article.
The article title is: "{{{title}}}".
The main focus key phrase is: "{{{focusKeyPhrase}}}".

We are starting with the **first** section (section {{{displayIndex}}} of {{totalSections}}).
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
    schema: GenerateSingleArticleSectionInputSchema, // Still needs all context, including displayIndex
  },
  output: {
    schema: GenerateSingleArticleSectionOutputSchema,
  },
  // Simpler prompt for subsequent sections, relying on context and previous style
  // Use {{{displayIndex}}} instead of {{add sectionIndex 1}}
  prompt: `Ok, let's continue with the article titled "{{{title}}}".
Focus Key Phrase: "{{{focusKeyPhrase}}}".

We are now working on section number {{{displayIndex}}} of {{totalSections}}.
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
  typeof GenerateSingleArticleSectionInputSchema, // Flow now expects displayIndex
  typeof GenerateSingleArticleSectionOutputSchema
>(
  {
    name: 'generateSingleArticleSectionFlow',
    inputSchema: GenerateSingleArticleSectionInputSchema, // Input schema includes displayIndex
    outputSchema: GenerateSingleArticleSectionOutputSchema,
  },
  async input => {
     // displayIndex is already calculated and included in 'input' passed to the flow

    // Choose the appropriate prompt based on whether it's the first section
    const selectedPrompt = input.isFirstSection ? firstSectionPrompt : subsequentSectionPrompt;

    // Pass the input (which includes displayIndex) to the selected prompt
    const {output} = await selectedPrompt(input);

    // Ensure the output is not null or undefined before returning
    if (!output || !output.sectionContent) {
        throw new Error('Failed to generate article section content.');
    }
    return output;
  }
);

// No need for Handlebars helpers as displayIndex is passed directly.
