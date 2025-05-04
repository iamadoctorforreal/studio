'use server';

/**
 * @fileOverview A voice-over audio generation AI agent using Google Cloud Text-to-Speech API.
 *
 * - generateVoiceOverAudio - A function that generates voice-over audio from the formatted article.
 * - GenerateVoiceOverAudioInput - The input type for the generateVoiceOverAudio function.
 * - GenerateVoiceOverAudioOutput - The return type for the generateVoiceOverAudio function.
 *
 * NOTE: This flow requires Google Cloud Text-to-Speech API to be enabled in your project
 * and proper authentication configured (e.g., via GOOGLE_APPLICATION_CREDENTIALS environment variable
 * or Application Default Credentials).
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

const GenerateVoiceOverAudioInputSchema = z.object({
  articleText: z
    .string()
    .min(1, "Article text cannot be empty.") // Basic validation
    .describe('The formatted article text to generate voice-over audio from.'),
  // Optional: Add parameters for voice selection, speed, pitch etc. if needed
  // voiceName: z.string().optional().describe('Optional voice name (e.g., en-US-Wavenet-D)'),
  // speakingRate: z.number().optional().min(0.25).max(4.0).describe('Optional speaking rate (0.25 to 4.0)'),
  // pitch: z.number().optional().min(-20.0).max(20.0).describe('Optional pitch (-20.0 to 20.0)'),
});
export type GenerateVoiceOverAudioInput = z.infer<typeof GenerateVoiceOverAudioInputSchema>;

const GenerateVoiceOverAudioOutputSchema = z.object({
  audioDataUri: z.string().describe('The generated voice-over audio as a base64 data URI (e.g., data:audio/mp3;base64,...).'),
});
export type GenerateVoiceOverAudioOutput = z.infer<typeof GenerateVoiceOverAudioOutputSchema>;


/**
 * Helper function to convert Buffer to Data URI
 * @param buffer The audio buffer received from the API.
 * @param mimeType The MIME type of the audio (e.g., 'audio/mp3').
 * @returns The data URI string.
 */
function bufferToDataURI(buffer: Buffer | Uint8Array, mimeType: string): string {
    const base64String = Buffer.from(buffer).toString('base64');
    return `data:${mimeType};base64,${base64String}`;
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
    if (!input.articleText || input.articleText.trim().length === 0) {
        throw new Error('Article text cannot be empty.');
    }

    console.log(`Attempting to generate voice over using Google TTS for text starting with: "${input.articleText.substring(0, 50)}..."`);

    try {
        // Creates a client
        const client = new TextToSpeechClient();

        // Construct the request
        const request = {
            input: { text: input.articleText },
            // Select the language code and SSML voice gender (optional)
            // See https://cloud.google.com/text-to-speech/docs/voices for available voices
            voice: { languageCode: 'en-US', name: 'en-US-Neural2-C', ssmlGender: 'FEMALE' as const }, // Example voice
            // select the type of audio encoding
            audioConfig: { audioEncoding: 'MP3' as const }, // Using MP3 encoding
        };

        // Performs the text-to-speech request
        console.log("Calling Google Cloud Text-to-Speech API...");
        const [response] = await client.synthesizeSpeech(request);
        console.log("Google Cloud TTS API response received.");

        if (!response.audioContent) {
            console.error("Google Cloud TTS API returned no audio content.");
            throw new Error('Google Cloud TTS API returned no audio content.');
        }

        // The response's audioContent is binary buffer or base64 string depending on client version/config
        // Ensure it's a Buffer for consistent handling
        const audioBuffer = Buffer.from(response.audioContent as string | Uint8Array);

        if (audioBuffer.length === 0) {
            console.error('Received empty audio buffer from Google Cloud TTS API.');
            throw new Error('Received empty audio buffer from Google Cloud TTS API. Generation likely failed.');
        }

        console.log(`Received audio buffer of size: ${audioBuffer.length} bytes.`);

        // Convert the buffer to a base64 data URI
        const audioDataUri = bufferToDataURI(audioBuffer, 'audio/mp3'); // Specify MP3 MIME type
        console.log("Successfully converted audio buffer to Data URI.");

        return { audioDataUri };

    } catch (error) {
        console.error('Error caught in generateVoiceOverAudioFlow (Google TTS):', error);
        // Check for common authentication errors
        let errorMessage = 'Failed to generate voice over audio using Google Cloud TTS.';
        if (error instanceof Error) {
           if (error.message.includes('Could not load the default credentials') || error.message.includes('permission denied')) {
              errorMessage += ' Please ensure Google Cloud authentication is configured correctly (e.g., GOOGLE_APPLICATION_CREDENTIALS or ADC) and the Text-to-Speech API is enabled.';
           } else {
               errorMessage += ` Details: ${error.message}`;
           }
        } else {
            errorMessage += ' An unexpected error occurred.';
        }
        console.error(errorMessage); // Log the detailed error message
        throw new Error(errorMessage); // Throw the user-friendly message
    }
});
