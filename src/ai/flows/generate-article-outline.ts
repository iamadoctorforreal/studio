// Use server directive to ensure code is run on the server
'use server';

/**
 * @fileOverview Generates a news article outline based on a title and focus key phrase.
 *
 * - generateArticleOutline - A function that generates the article outline.
 * - GenerateArticleOutlineInput - The input type for the generateArticleOutline function.
 * - GenerateArticleOutlineOutput - The return type for the generateArticleOutline function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

/**
 * Input schema for generating article outline.
 */
const GenerateArticleOutlineInputSchema = z.object({
  title: z.string().describe('The title of the news article.'),
  focusKeyPhrase: z.string().describe('The focus key phrase for the article.'),
});

export type GenerateArticleOutlineInput = z.infer<typeof GenerateArticleOutlineInputSchema>;

/**
 * Output schema for the generated article outline.
 */
const GenerateArticleOutlineOutputSchema = z.object({
  outline: z.string().describe('The generated news article outline.'),
});

export type GenerateArticleOutlineOutput = z.infer<typeof GenerateArticleOutlineOutputSchema>;

/**
 * Wrapper function to generate the article outline.
 * @param input - Input parameters including title and focus key phrase.
 * @returns A promise resolving to the generated article outline.
 */
export async function generateArticleOutline(input: GenerateArticleOutlineInput): Promise<GenerateArticleOutlineOutput> {
  return generateArticleOutlineFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateArticleOutlinePrompt',
  input: {
    schema: z.object({
      title: z.string().describe('The title of the news article.'),
      focusKeyPhrase: z.string().describe('The focus key phrase for the article.'),
    }),
  },
  output: {
    schema: z.object({
      outline: z.string().describe('The generated news article outline.'),
    }),
  },
  prompt: `You are an AI assistant specialized in creating news article outlines.
  Based on the provided title and focus key phrase, generate a detailed and well-structured outline for a news article.

  Title: {{{title}}}
  Focus Key Phrase: {{{focusKeyPhrase}}}

  Outline:`, // Just outputting the outline
});

const generateArticleOutlineFlow = ai.defineFlow<
  typeof GenerateArticleOutlineInputSchema,
  typeof GenerateArticleOutlineOutputSchema
>(
  {
    name: 'generateArticleOutlineFlow',
    inputSchema: GenerateArticleOutlineInputSchema,
    outputSchema: GenerateArticleOutlineOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
