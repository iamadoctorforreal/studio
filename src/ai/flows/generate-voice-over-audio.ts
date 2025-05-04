'use server';

/**
 * @fileOverview A voice-over audio generation AI agent using Hugging Face Inference API.
 *
 * - generateVoiceOverAudio - A function that generates voice-over audio from the formatted article.
 * - GenerateVoiceOverAudioInput - The input type for the generateVoiceOverAudio function.
 * - GenerateVoiceOverAudioOutput - The return type for the generateVoiceOverAudio function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const HUGGING_FACE_API_URL = "https://api-inference.huggingface.co/models/innoai/Edge-TTS-Text-to-Speech";
const HUGGING_FACE_API_KEY = process.env.HUGGING_FACE_API_KEY;

const GenerateVoiceOverAudioInputSchema = z.object({
  articleText: z
    .string()
    .describe('The formatted article text to generate voice-over audio from.'),
});
export type GenerateVoiceOverAudioInput = z.infer<typeof GenerateVoiceOverAudioInputSchema>;

const GenerateVoiceOverAudioOutputSchema = z.object({
  audioDataUri: z.string().describe('The generated voice-over audio as a base64 data URI.'),
});
export type GenerateVoiceOverAudioOutput = z.infer<typeof GenerateVoiceOverAudioOutputSchema>;

/**
 * Helper function to convert Blob to Data URI
 */
async function blobToDataURI(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        // Ensure the MIME type is correctly set if possible, default to audio/mpeg
        const mimeType = blob.type || 'audio/mpeg';
        const base64String = reader.result.split(',')[1];
        resolve(`data:${mimeType};base64,${base64String}`);
      } else {
        reject(new Error('Failed to convert blob to Data URI: Invalid result type'));
      }
    };
    reader.onerror = (error) => reject(new Error(`FileReader error: ${error}`));
    reader.readAsDataURL(blob);
  });
}


export async function generateVoiceOverAudio(
  input: GenerateVoiceOverAudioInput
): Promise<GenerateVoiceOverAudioOutput> {
  return generateVoiceOverAudioFlow(input);
}


const generateVoiceOverAudioFlow = ai.defineFlow<
  typeof GenerateVoiceOverAudioInputSchema,
  typeof GenerateVoiceOverAudioOutputSchema
>({
  name: 'generateVoiceOverAudioFlow',
  inputSchema: GenerateVoiceOverAudioInputSchema,
  outputSchema: GenerateVoiceOverAudioOutputSchema,
},
async (input: GenerateVoiceOverAudioInput): Promise<GenerateVoiceOverAudioOutput> => {
    if (!HUGGING_FACE_API_KEY) {
        throw new Error('Hugging Face API key is not configured.');
    }
     if (!input.articleText || input.articleText.trim().length === 0) {
        throw new Error('Article text cannot be empty.');
    }

    try {
        console.log("Calling Hugging Face API for TTS...");
        const response = await fetch(HUGGING_FACE_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${HUGGING_FACE_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ inputs: input.articleText }),
        });

         console.log(`Hugging Face API Response Status: ${response.status}`);

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("Hugging Face API Error Body:", errorBody);
            throw new Error(`Hugging Face API request failed with status ${response.status}: ${response.statusText}. Body: ${errorBody}`);
        }

        // The API returns the audio file directly as the response body
        const audioBlob = await response.blob();
        console.log(`Received audio blob of type: ${audioBlob.type} and size: ${audioBlob.size}`);

        if (audioBlob.size === 0) {
            throw new Error('Received empty audio blob from Hugging Face API.');
        }

        const audioDataUri = await blobToDataURI(audioBlob);
        console.log("Successfully converted audio blob to Data URI.");

        return { audioDataUri };

    } catch (error) {
        console.error('Error in generateVoiceOverAudioFlow:', error);
        // Re-throw a more specific error or handle it as needed
         if (error instanceof Error) {
             throw new Error(`Failed to generate voice over audio: ${error.message}`);
         } else {
            throw new Error('An unknown error occurred during voice over generation.');
         }
    }
});
