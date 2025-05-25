'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating a concise summary
 *              for a given text chunk from an SRT file.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit'; // Assuming genkit is used

const GenerateSrtChunkSummaryInputSchema = z.object({
  chunkText: z.string().describe('The text content of the SRT chunk.'),
  // Optional: Add context if needed, e.g., overall topic of the video
  // videoTopic: z.string().optional().describe('The overall topic of the video for better summary context.'),
});
export type GenerateSrtChunkSummaryInput = z.infer<
  typeof GenerateSrtChunkSummaryInputSchema
>;

const GenerateSrtChunkSummaryOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the SRT chunk text.'),
});
export type GenerateSrtChunkSummaryOutput = z.infer<
  typeof GenerateSrtChunkSummaryOutputSchema
>;

const summaryPrompt = ai.definePrompt({
  name: 'generateSrtChunkSummaryPrompt',
  input: {
    schema: GenerateSrtChunkSummaryInputSchema,
  },
  output: {
    schema: GenerateSrtChunkSummaryOutputSchema,
  },
  prompt: `Given the following text segment from a video transcript, please generate a concise summary (1-2 sentences).
The summary should capture the main essence of the text.

Text Segment:
"""
{{{chunkText}}}
"""

Concise Summary:`,
});

export const generateSrtChunkSummary = ai.defineFlow<
  typeof GenerateSrtChunkSummaryInputSchema,
  typeof GenerateSrtChunkSummaryOutputSchema
>(
  {
    name: 'generateSrtChunkSummaryFlow',
    inputSchema: GenerateSrtChunkSummaryInputSchema,
    outputSchema: GenerateSrtChunkSummaryOutputSchema,
  },
  async (input) => {
    const { output } = await summaryPrompt(input);

    if (!output || typeof output.summary !== 'string') {
      console.error('Failed to generate summary or output is not a string:', output);
      // Return an empty summary or throw a more specific error
      return { summary: '' };
      // Or: throw new Error('Failed to generate a valid summary string.');
    }
    return { summary: output.summary };
  }
);
