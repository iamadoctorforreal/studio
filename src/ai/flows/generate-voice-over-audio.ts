'use server';

/**
 * @fileOverview A voice-over audio generation AI agent.
 *
 * - generateVoiceOverAudio - A function that generates voice-over audio from the formatted article.
 * - GenerateVoiceOverAudioInput - The input type for the generateVoiceOverAudio function.
 * - GenerateVoiceOverAudioOutput - The return type for the generateVoiceOverAudio function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const GenerateVoiceOverAudioInputSchema = z.object({
  articleText: z
    .string()
    .describe('The formatted article text to generate voice-over audio from.'),
});
export type GenerateVoiceOverAudioInput = z.infer<typeof GenerateVoiceOverAudioInputSchema>;

const GenerateVoiceOverAudioOutputSchema = z.object({
  audioUrl: z.string().describe('The URL of the generated voice-over audio.'),
});
export type GenerateVoiceOverAudioOutput = z.infer<typeof GenerateVoiceOverAudioOutputSchema>;

export async function generateVoiceOverAudio(
  input: GenerateVoiceOverAudioInput
): Promise<GenerateVoiceOverAudioOutput> {
  return generateVoiceOverAudioFlow(input);
}

const generateVoiceOverAudioPrompt = ai.definePrompt({
  name: 'generateVoiceOverAudioPrompt',
  input: {
    schema: z.object({
      articleText: z
        .string()
        .describe('The formatted article text to generate voice-over audio from.'),
    }),
  },
  output: {
    schema: z.object({
      audioUrl: z.string().describe('The URL of the generated voice-over audio.'),
    }),
  },
  prompt: `You are a voice-over generator that converts the following article text into voice-over audio URL.

Article Text: {{{articleText}}}

Respond with the audio URL`,
});

const generateVoiceOverAudioFlow = ai.defineFlow<
  typeof GenerateVoiceOverAudioInputSchema,
  typeof GenerateVoiceOverAudioOutputSchema
>({
  name: 'generateVoiceOverAudioFlow',
  inputSchema: GenerateVoiceOverAudioInputSchema,
  outputSchema: GenerateVoiceOverAudioOutputSchema,
},
async input => {
  // TODO: Implement the logic to break down the article into batches if there are character limits,
  // and use the innoai/Edge-TTS-Text-to-Speech model from huggingface.co to generate voice-over audio.
  // Then, return the audio URL.

  const {output} = await generateVoiceOverAudioPrompt(input);
  return output!;
});
