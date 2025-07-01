'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating long-tail keywords
 *              for a given text chunk from an SRT file.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'zod';

const GenerateSrtChunkKeywordsInputSchema = z.object({
  chunkText: z.string().describe('The text content of the SRT chunk.'),
});
export type GenerateSrtChunkKeywordsInput = z.infer<
  typeof GenerateSrtChunkKeywordsInputSchema
>;

const GenerateSrtChunkKeywordsOutputSchema = z.object({
  keywords: z.array(z.string()).describe('An array of approximately 5 long-tail keywords relevant to the chunk text.'),
});
export type GenerateSrtChunkKeywordsOutput = z.infer<
  typeof GenerateSrtChunkKeywordsOutputSchema
>;

const keywordsPrompt = ai.definePrompt({
  name: 'generateSrtChunkKeywordsPrompt',
  input: {
    schema: GenerateSrtChunkKeywordsInputSchema,
  },
  output: {
    format: 'json',
    schema: GenerateSrtChunkKeywordsOutputSchema,
  },
  prompt: `Given the following text segment from a video transcript, please generate approximately 5 relevant long-tail keywords.
These keywords should be specific and capture the main topics or themes of the text.
The keywords will be used to find relevant stock video footage.
Output the keywords as a JSON array of strings.

Text Segment:
"""
{{{chunkText}}}
"""

Keywords (JSON array of strings):`,
});

export const generateSrtChunkKeywords = ai.defineFlow<
  typeof GenerateSrtChunkKeywordsInputSchema,
  typeof GenerateSrtChunkKeywordsOutputSchema
>(
  {
    name: 'generateSrtChunkKeywordsFlow',
    inputSchema: GenerateSrtChunkKeywordsInputSchema,
    outputSchema: GenerateSrtChunkKeywordsOutputSchema,
  },
  async (input) => {
    const { output } = await keywordsPrompt(input);

    if (!output || !output.keywords || !Array.isArray(output.keywords)) {
      console.error('Failed to generate keywords or output is not an array:', output);
      return { keywords: [] };
    }
    
    const validKeywords = output.keywords.filter(kw => typeof kw === 'string');
    return { keywords: validKeywords };
  }
);