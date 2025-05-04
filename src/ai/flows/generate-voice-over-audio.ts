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

// Ensure the API key is loaded from environment variables
const HUGGING_FACE_API_KEY = process.env.HUGGING_FACE_API_KEY;
const HUGGING_FACE_API_URL = "https://api-inference.huggingface.co/models/innoai/Edge-TTS-Text-to-Speech";


const GenerateVoiceOverAudioInputSchema = z.object({
  articleText: z
    .string()
    .min(1, "Article text cannot be empty.") // Basic validation
    .describe('The formatted article text to generate voice-over audio from.'),
});
export type GenerateVoiceOverAudioInput = z.infer<typeof GenerateVoiceOverAudioInputSchema>;

const GenerateVoiceOverAudioOutputSchema = z.object({
  audioDataUri: z.string().describe('The generated voice-over audio as a base64 data URI (e.g., data:audio/mpeg;base64,...).'), // Added example format
});
export type GenerateVoiceOverAudioOutput = z.infer<typeof GenerateVoiceOverAudioOutputSchema>;

/**
 * Helper function to convert Blob to Data URI
 * @param blob The audio blob received from the API.
 * @returns A promise resolving to the data URI string.
 */
async function blobToDataURI(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        // Ensure the MIME type is correctly set if possible, default to audio/mpeg if not specified
        const mimeType = blob.type || 'audio/mpeg';
        // The result includes the 'data:mime/type;base64,' prefix, which is what we want.
        resolve(reader.result);
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
  // Validate input using Zod before calling the flow
   const validatedInput = GenerateVoiceOverAudioInputSchema.parse(input);
  return generateVoiceOverAudioFlow(validatedInput);
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
        console.error('Hugging Face API key is missing.');
        throw new Error('Hugging Face API key is not configured. Please set HUGGING_FACE_API_KEY environment variable.');
    }
     if (!input.articleText || input.articleText.trim().length === 0) {
         // This check is technically redundant due to Zod validation, but good practice.
        throw new Error('Article text cannot be empty.');
    }

    console.log(`Attempting to generate voice over for text starting with: "${input.articleText.substring(0, 50)}..."`);

    try {
        console.log("Calling Hugging Face API for TTS at:", HUGGING_FACE_API_URL);
        const response = await fetch(HUGGING_FACE_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${HUGGING_FACE_API_KEY}`,
                'Content-Type': 'application/json',
                 'Accept': 'audio/mpeg', // Explicitly accept audio
            },
            body: JSON.stringify({ inputs: input.articleText }),
        });

         console.log(`Hugging Face API Response Status: ${response.status}`);

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("Hugging Face API Error Body:", errorBody);
            // Provide more context in the error message
            let errorMessage = `Hugging Face API request failed with status ${response.status}: ${response.statusText}.`;
            try {
                // Attempt to parse error body as JSON for more structured info
                const errorJson = JSON.parse(errorBody);
                 if (errorJson.error) {
                    errorMessage += ` Error: ${errorJson.error}`;
                 }
                 if (errorJson.warnings) {
                    errorMessage += ` Warnings: ${errorJson.warnings.join(', ')}`;
                 }
            } catch (e) {
                 // If not JSON, just append the raw text
                errorMessage += ` Body: ${errorBody}`;
            }
            throw new Error(errorMessage);
        }

        // The API returns the audio file directly as the response body
        const audioBlob = await response.blob();
        console.log(`Received audio blob of type: ${audioBlob.type} and size: ${audioBlob.size} bytes.`);

        if (audioBlob.size === 0) {
            // This might indicate an issue with the input text or the model itself
            console.error('Received empty audio blob from Hugging Face API. Check input text or model status.');
            throw new Error('Received empty audio blob from Hugging Face API. Generation likely failed silently.');
        }

        // Convert the blob to a base64 data URI
        const audioDataUri = await blobToDataURI(audioBlob);
        console.log("Successfully converted audio blob to Data URI.");
        // console.log("Data URI preview:", audioDataUri.substring(0, 100) + "..."); // Log prefix for verification

        return { audioDataUri };

    } catch (error) {
        console.error('Error caught in generateVoiceOverAudioFlow:', error);
         if (error instanceof Error) {
             // Propagate the specific error message
             throw new Error(`Failed to generate voice over audio: ${error.message}`);
         } else {
             // Handle non-Error objects being thrown
            throw new Error('An unexpected error occurred during voice over generation.');
         }
    }
});