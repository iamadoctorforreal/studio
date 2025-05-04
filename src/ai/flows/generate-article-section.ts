'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating news article sections in a conversational Nigerian style.
 *
 * - generateArticleSection - A function that generates a section of a news article.
 * - GenerateArticleSectionInput - The input type for the generateArticleSection function.
 * - GenerateArticleSectionOutput - The output type for the generateArticleSection function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const GenerateArticleSectionInputSchema = z.object({
  title: z.string().describe('The title of the news article.'),
  outline: z.string().describe('The outline of the section to generate.'),
  keywords: z.string().describe('SEO-focused keywords for the section.'),
});
export type GenerateArticleSectionInput = z.infer<
  typeof GenerateArticleSectionInputSchema
>;

const GenerateArticleSectionOutputSchema = z.object({
  sectionContent: z
    .string()
    .describe('The generated content for the article section.'),
});
export type GenerateArticleSectionOutput = z.infer<
  typeof GenerateArticleSectionOutputSchema
>;

export async function generateArticleSection(
  input: GenerateArticleSectionInput
): Promise<GenerateArticleSectionOutput> {
  return generateArticleSectionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateArticleSectionPrompt',
  input: {
    schema: z.object({
      title: z.string().describe('The title of the news article.'),
      outline: z.string().describe('The outline of the section to generate.'),
      keywords: z.string().describe('SEO-focused keywords for the section.'),
    }),
  },
  output: {
    schema: z.object({
      sectionContent: z
        .string()
        .describe('The generated content for the article section.'),
    }),
  },
  prompt: `You are a Nigerian news writer skilled in conversational writing, emotional intelligence, and SEO.

  Generate a section of a news article based on the following title, outline, and keywords. Write in a conversational Nigerian style.

  Title: {{{title}}}
  Outline: {{{outline}}}
  Keywords: {{{keywords}}}

  Section Content:`,
});

const generateArticleSectionFlow = ai.defineFlow<
  typeof GenerateArticleSectionInputSchema,
  typeof GenerateArticleSectionOutputSchema
>(
  {
    name: 'generateArticleSectionFlow',
    inputSchema: GenerateArticleSectionInputSchema,
    outputSchema: GenerateArticleSectionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
