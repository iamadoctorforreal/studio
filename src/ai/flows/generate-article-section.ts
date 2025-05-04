
'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating ONE specific section of a news article
 *              in a conversational Nigerian style, focusing on emotional intelligence and SEO.
 *
 * - generateSingleArticleSection - Generates content for a single section based on the overall title,
 *                                   focus key phrase, and the specific section topic/heading.
 * - GenerateSingleArticleSectionInput - The input type for the function.
 * - GenerateSingleArticleSectionOutput - The output type for the function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const GenerateSingleArticleSectionInputSchema = z.object({
  title: z.string().describe('The overall title of the news article.'),
  focusKeyPhrase: z.string().describe('The main focus key phrase for the entire article.'),
  sectionTopic: z.string().describe('The specific heading or topic for THIS section from the outline.'),
  // Removed 'outline' and 'keywords' as they are less relevant for single section generation with the new prompt.
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

// Renamed function for clarity
export async function generateSingleArticleSection(
  input: GenerateSingleArticleSectionInput
): Promise<GenerateSingleArticleSectionOutput> {
  return generateSingleArticleSectionFlow(input);
}

// Updated prompt based on user requirements
const prompt = ai.definePrompt({
  name: 'generateSingleArticleSectionPrompt', // Renamed for clarity
  input: {
    schema: z.object({
      title: z.string().describe('The overall title of the news article.'),
      focusKeyPhrase: z.string().describe('The main focus key phrase for the entire article.'),
      sectionTopic: z.string().describe('The specific heading or topic for THIS section from the outline.'),
    }),
  },
  output: {
    schema: z.object({
      sectionContent: z
        .string()
        .describe('The generated content for the specified article section.'),
    }),
  },
  // Updated prompt reflecting Nigerian conversational style, tone, and instructions
  prompt: `Okay, listen up! We are writing one investigative journalism report article, section by section.
  Your focus right now is ONLY on writing the content for the section titled: "{{{sectionTopic}}}".
  This section is part of the larger article titled: "{{{title}}}".
  The main focus key phrase for the whole article is: "{{{focusKeyPhrase}}}".

  Now, write JUST THIS SECTION ("{{{sectionTopic}}}").
  Adopt a very conversational tone, like you're talking directly to a Nigerian friend. Use local slang and phrases naturally where appropriate (e.g., "Naija," "wahala," "dey play," "abeg," "o").
  No filler words, Biko! Make every sentence count.
  Your writing must have character and personality – be emotionally intelligent, connect with the reader.
  Make sure the content naturally incorporates the focus key phrase "{{{focusKeyPhrase}}}" if relevant to this specific section, helping our target audience find this through search.

  Remember, ONLY write the content for the "{{{sectionTopic}}}" section. Don't add introductions or conclusions for the whole article.

  Section Content for "{{{sectionTopic}}}":`,
});

// Renamed flow for clarity
const generateSingleArticleSectionFlow = ai.defineFlow<
  typeof GenerateSingleArticleSectionInputSchema,
  typeof GenerateSingleArticleSectionOutputSchema
>(
  {
    name: 'generateSingleArticleSectionFlow', // Renamed
    inputSchema: GenerateSingleArticleSectionInputSchema,
    outputSchema: GenerateSingleArticleSectionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
     // Ensure the output is not null or undefined before returning
    if (!output || !output.sectionContent) {
        throw new Error('Failed to generate article section content.');
    }
    return output;
  }
);
