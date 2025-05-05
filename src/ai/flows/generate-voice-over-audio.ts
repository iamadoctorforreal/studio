'use server';

/**
 * @fileOverview A voice-over audio generation AI agent using Google Cloud Text-to-Speech API.
 *
 * - generateVoiceOverAudio - A function that generates voice-over audio from the formatted article.
 * - GenerateVoiceOverAudioInput - The input type for the generateVoiceOverAudio function.
 * - GenerateVoiceOverAudioOutput - The return type for the generateVoiceOverAudio function.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';
import textToSpeech, { protos } from '@google-cloud/text-to-speech';
import { promises as fs } from 'fs'; // For file system operations (optional, could stream directly)
import path from 'path'; // For handling file paths if saving temporarily
import os from 'os'; // For finding temporary directory if saving temporarily

// --- Constants ---
// Default voice configuration for Google Cloud TTS
const DEFAULT_LANGUAGE_CODE = 'en-US';
// Using a standard voice, WaveNet voices might incur higher costs.
const DEFAULT_VOICE_NAME = 'en-US-Standard-C'; // Example standard voice
const DEFAULT_AUDIO_ENCODING: protos.google.cloud.texttospeech.v1.AudioEncoding = 'MP3';

// Instantiate the Google Cloud Text-to-Speech client
// Authentication is handled automatically via Application Default Credentials (ADC)
// Make sure ADC is configured in your environment (e.g., `gcloud auth application-default login`)
const ttsClient = new textToSpeech.TextToSpeechClient();

const GenerateVoiceOverAudioInputSchema = z.object({
  articleText: z
    .string()
    .min(1, "Article text cannot be empty.")
    // Google Cloud TTS has limits, but they are typically high (e.g., 5000 bytes per request for standard API)
    // Adjust based on potential usage and expected article length.
    .max(100000, "Article text is very long, consider breaking it down for synthesis.")
    .describe('The formatted article text to generate voice-over audio from.'),
  languageCode: z.string().optional().default(DEFAULT_LANGUAGE_CODE).describe('BCP-47 language code (e.g., en-US, en-GB).'),
  voiceName: z.string().optional().default(DEFAULT_VOICE_NAME).describe('Specific voice name (e.g., en-US-Wavenet-D). See Google Cloud TTS documentation for options.'),
  // Removed voiceId as it's not directly applicable to Google TTS in the same way
  // Removed bitrate as it's part of audioConfig
});
export type GenerateVoiceOverAudioInput = z.infer<typeof GenerateVoiceOverAudioInputSchema>;

const GenerateVoiceOverAudioOutputSchema = z.object({
  audioDataUri: z.string().describe('The generated voice-over audio as a base64 data URI (e.g., data:audio/mpeg;base64,...).'),
});
export type GenerateVoiceOverAudioOutput = z.infer<typeof GenerateVoiceOverAudioOutputSchema>;

/**
 * Helper function to convert ArrayBuffer or Buffer to Data URI
 * @param buffer The audio buffer.
 * @param mimeType The MIME type of the audio (e.g., 'audio/mpeg').
 * @returns The data URI string.
 */
function bufferToDataURI(buffer: Buffer | ArrayBuffer, mimeType: string): string {
    if (typeof Buffer === 'undefined') {
        throw new Error("Buffer API is not available in this environment.");
    }
    const base64String = Buffer.isBuffer(buffer) ? buffer.toString('base64') : Buffer.from(buffer).toString('base64');
    return `data:${mimeType};base64,${base64String}`;
}

// Removed shell escaping and availability check functions as they are no longer needed.

export async function generateVoiceOverAudio(
  input: GenerateVoiceOverAudioInput
): Promise<GenerateVoiceOverAudioOutput> {
  // Validate input using Zod before calling the flow
  const validatedInput = GenerateVoiceOverAudioInputSchema.parse(input);

  // No availability check needed as we use the official library
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
async (input): Promise<GenerateVoiceOverAudioOutput> => {
    if (!input.articleText || input.articleText.trim().length === 0) {
        throw new Error('Article text cannot be empty.');
    }

    console.log(`Starting Google Cloud TTS Flow for text (${input.articleText.length} chars) using voice: ${input.voiceName}, lang: ${input.languageCode}`);

    // Construct the synthesis request for Google Cloud TTS
    const request: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
        input: { text: input.articleText },
        voice: {
            languageCode: input.languageCode,
            name: input.voiceName,
            // ssmlGender can be added if needed, e.g., 'NEUTRAL', 'FEMALE', 'MALE'
        },
        audioConfig: {
            audioEncoding: DEFAULT_AUDIO_ENCODING,
             // You can add speakingRate, pitch, volumeLevel, effectsProfileId etc. here
             // speakingRate: 1.0, // Default
             // pitch: 0, // Default
        },
    };

    try {
        console.log('Sending request to Google Cloud Text-to-Speech API...');
        // --- Step 1: Call Google Cloud TTS API ---
        const [response] = await ttsClient.synthesizeSpeech(request);
        console.log('Received response from Google Cloud TTS API.');

        if (!response.audioContent) {
            throw new Error('Google Cloud TTS API returned successfully but with no audio content.');
        }

        // --- Step 2: Get the audio buffer ---
        // response.audioContent is the audio buffer (Uint8Array or Buffer)
        const audioBuffer = response.audioContent as Buffer; // Cast or ensure it's a Buffer

        if (audioBuffer.length === 0) {
            throw new Error('Generated audio content is empty.');
        }
        console.log(`Received audio buffer (${audioBuffer.length} bytes).`);

        // --- Step 3: Convert to Data URI ---
        const audioDataUri = bufferToDataURI(audioBuffer, 'audio/mpeg'); // Assuming MP3 encoding
        console.log("Successfully converted audio buffer to Data URI.");

        // No temporary file handling needed as we get the buffer directly

        return { audioDataUri };

     } catch (error: any) {
         console.error('Error caught in generateVoiceOverAudioFlow (Google Cloud TTS):', error);

        let errorMessage = 'Failed to generate voice over audio using Google Cloud TTS.';

         if (error instanceof Error) {
             // Check for common Google Cloud errors (e.g., authentication, quota)
             if (error.message.includes('Could not refresh access token') || error.message.includes('credential')) {
                 errorMessage += ' Potential authentication issue. Ensure Application Default Credentials (ADC) are configured correctly (run `gcloud auth application-default login`).';
             } else if (error.message.includes('Quota') || error.message.includes('rate limit')) {
                 errorMessage += ' API quota or rate limit exceeded. Check your Google Cloud project quotas.';
             } else if (error.message.includes('invalid argument') && error.message.includes('Voice name')) {
                 errorMessage += ` Invalid voice name specified: '${input.voiceName}'. Please check available voices for language '${input.languageCode}'.`;
             }
             // Include the original error message for more details
             errorMessage += ` Details: ${error.message}`;
         } else {
             errorMessage += ' An unexpected error occurred.';
         }

         console.error("Final Error Message to Throw:", errorMessage); // Log the detailed error message
         throw new Error(errorMessage); // Throw the user-friendly message
     }
});
