'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating long-tail keywords
 *              for a given text chunk from an SRT file.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit'; // Assuming genkit is used based on the template, adjust if it's a different Zod instance

const GenerateSrtChunkKeywordsInputSchema = z.object({
  chunkText: z.string().describe('The text content of the SRT chunk.'),
  // Optional: Add context if needed, e.g., overall topic of the video
  // videoTopic: z.string().optional().describe('The overall topic of the video for better keyword relevance.'),
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
    // Instruct the model to output a JSON array of strings
    format: 'json', // Important for structured output
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
      // Return an empty array or throw a more specific error
      return { keywords: [] };
      // Or: throw new Error('Failed to generate valid keywords array.');
    }
    // Ensure all keywords are strings, filter out any non-string elements if necessary
    const validKeywords = output.keywords.filter(kw => typeof kw === 'string');
    return { keywords: validKeywords };
  }
);
