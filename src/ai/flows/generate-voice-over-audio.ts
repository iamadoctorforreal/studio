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
import { promises as fs } from 'fs'; // For file system operations (reading/deleting temp file)
import path from 'path'; // For handling file paths
import os from 'os'; // For finding temporary directory

// --- Constants ---
const GOOGLE_TTS_MAX_CHARS = 4900; // Stay slightly under the 5000 limit for safety
// Default voice configuration for Google Cloud TTS
const DEFAULT_LANGUAGE_CODE = 'en-US';
// Using a standard voice, WaveNet voices might incur higher costs.
const DEFAULT_VOICE_NAME = 'en-US-Standard-C'; // Example standard voice
const DEFAULT_AUDIO_ENCODING: protos.google.cloud.texttospeech.v1.AudioEncoding = 'MP3';

// Instantiate the Google Cloud Text-to-Speech client
// Authentication is handled automatically via Application Default Credentials (ADC)
// Make sure ADC is configured in your environment (e.g., `gcloud auth application-default login` for local dev,
// or service account credentials via GOOGLE_APPLICATION_CREDENTIALS env var for servers/VMs,
// or built-in service accounts for Cloud Run/Functions/App Engine).
let ttsClient: textToSpeech.TextToSpeechClient | null = null;
try {
    ttsClient = new textToSpeech.TextToSpeechClient();
    console.log("Google Cloud Text-to-Speech client initialized successfully.");
} catch (initError: any) {
    console.error("FATAL: Failed to initialize Google Cloud Text-to-Speech client.", initError);
    // If initialization fails, subsequent calls will also fail.
    // Log a more detailed error message here.
     let initErrorMessage = "FATAL ERROR initializing Google Cloud TTS Client. ";
     if (initError.message.includes('Could not load the default credentials') || initError.message.includes('Could not refresh access token')) {
         initErrorMessage += "Authentication failed. Ensure Application Default Credentials (ADC) are configured correctly in the server environment. For local development, run `gcloud auth application-default login`. For servers/VMs, set the GOOGLE_APPLICATION_CREDENTIALS environment variable pointing to your service account key file. On Google Cloud platforms (Cloud Run, Functions, App Engine, GKE), ensure the runtime service account has the 'roles/cloudtts.serviceAgent' role.";
     } else {
         initErrorMessage += `Details: ${initError.message}`;
     }
     console.error(initErrorMessage);
     // We don't throw here, but the generate flow will fail if the client is null.
}


const GenerateVoiceOverAudioInputSchema = z.object({
  articleText: z
    .string()
    .min(1, "Article text cannot be empty.")
    // Google Cloud TTS has limits, but they are typically high (e.g., 5000 bytes per request for standard API)
    // We will handle splitting internally, but keep a reasonable overall limit.
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

/**
 * Splits text into chunks smaller than the specified limit, trying to split at sentence boundaries.
 * @param text The full text to split.
 * @param limit The maximum character limit per chunk.
 * @returns An array of text chunks.
 */
function splitTextIntoChunks(text: string, limit: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';
    // Split by sentence-ending punctuation followed by space or newline. Handles ., !, ?
    const sentences = text.split(/(?<=[.!?])(?:\s+|\n)/).filter(s => s.trim().length > 0);

    for (const sentence of sentences) {
        const trimmedSentence = sentence.trim();
        if (trimmedSentence.length === 0) continue;

        // If a single sentence is too long, split it hard (less ideal)
        if (trimmedSentence.length > limit) {
            console.warn(`Single sentence exceeds limit (${trimmedSentence.length}/${limit}). Splitting mid-sentence.`);
            if (currentChunk) { // Add the current chunk before the long sentence
                chunks.push(currentChunk);
                currentChunk = '';
            }
            // Hard split the long sentence
            for (let i = 0; i < trimmedSentence.length; i += limit) {
                chunks.push(trimmedSentence.substring(i, i + limit));
            }
        } else if (currentChunk.length + trimmedSentence.length + 1 <= limit) { // +1 for potential space
            currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
        } else {
            // Current chunk is full, push it and start a new one
            chunks.push(currentChunk);
            currentChunk = trimmedSentence;
        }
    }

    // Add the last remaining chunk
    if (currentChunk) {
        chunks.push(currentChunk);
    }

    return chunks;
}


export async function generateVoiceOverAudio(
  input: GenerateVoiceOverAudioInput
): Promise<GenerateVoiceOverAudioOutput> {
  // Validate input using Zod before calling the flow
  const validatedInput = GenerateVoiceOverAudioInputSchema.parse(input);

  // Check if the client was initialized successfully
  if (!ttsClient) {
        throw new Error("Google Cloud Text-to-Speech client failed to initialize. Check server logs for authentication issues. Ensure ADC or GOOGLE_APPLICATION_CREDENTIALS is set up correctly.");
  }

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
    if (!ttsClient) {
        // This check is redundant if the wrapper function already checks, but good for safety.
        throw new Error("Google Cloud Text-to-Speech client is not initialized. Authentication likely failed during startup. Check server logs.");
    }
    if (!input.articleText || input.articleText.trim().length === 0) {
        throw new Error('Article text cannot be empty.');
    }

    console.log(`Starting Google Cloud TTS Flow for text (${input.articleText.length} chars) using voice: ${input.voiceName}, lang: ${input.languageCode}`);

    // Split the input text into manageable chunks
    const textChunks = splitTextIntoChunks(input.articleText, GOOGLE_TTS_MAX_CHARS);
    console.log(`Text split into ${textChunks.length} chunks for synthesis.`);

    const audioBuffers: Buffer[] = [];

    try {
        // Process each chunk sequentially
        for (let i = 0; i < textChunks.length; i++) {
            const chunk = textChunks[i];
            console.log(`Synthesizing chunk ${i + 1}/${textChunks.length} (${chunk.length} chars)...`);

            // Construct the synthesis request for Google Cloud TTS
            const request: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
                input: { text: chunk },
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

            console.log('Sending request to Google Cloud Text-to-Speech API for chunk...');
            // --- Step 1: Call Google Cloud TTS API for the chunk ---
            const [response] = await ttsClient.synthesizeSpeech(request);
            console.log(`Received response for chunk ${i + 1}`);

            if (!response.audioContent) {
                throw new Error(`Google Cloud TTS API returned successfully but with no audio content for chunk ${i + 1}.`);
            }

            // --- Step 2: Get the audio buffer for the chunk ---
            const audioBuffer = response.audioContent as Buffer; // Cast or ensure it's a Buffer

            if (audioBuffer.length === 0) {
                console.warn(`Generated audio content for chunk ${i + 1} is empty.`);
                // Decide if you want to continue or throw an error. Continuing might result in gaps.
                // For now, let's throw an error if a chunk produces empty audio.
                throw new Error(`Generated audio content for chunk ${i + 1} was empty.`);
            }
            console.log(`Received audio buffer for chunk ${i + 1} (${audioBuffer.length} bytes).`);
            audioBuffers.push(audioBuffer);
        }

        // --- Step 3: Concatenate all audio buffers ---
        if (audioBuffers.length === 0) {
            throw new Error("No audio buffers were generated (perhaps the input text was empty after splitting?).");
        }

        const combinedBuffer = Buffer.concat(audioBuffers);
        console.log(`Combined audio buffers into a single buffer (${combinedBuffer.length} bytes).`);

        // --- Step 4: Convert combined buffer to Data URI ---
        const audioDataUri = bufferToDataURI(combinedBuffer, 'audio/mpeg'); // Assuming MP3 encoding
        console.log("Successfully converted combined audio buffer to Data URI.");

        return { audioDataUri };

     } catch (error: any) {
         console.error('Error caught in generateVoiceOverAudioFlow (Google Cloud TTS with chunking):', error);

        let errorMessage = 'Failed to generate voice over audio using Google Cloud TTS.';

         if (error instanceof Error) {
             // Check for common Google Cloud errors (e.g., authentication, quota)
             // Enhanced Authentication Error Check
             if (error.message.includes('Could not refresh access token') || error.message.includes('credential') || error.message.includes('Could not load the default credentials') || (error.code && error.code === 16) /* UNAUTHENTICATED */ || error.message.includes('permission')) {
                errorMessage = "Google Cloud TTS Authentication/Permission Error. ";
                errorMessage += "Ensure Application Default Credentials (ADC) are configured correctly in the **server environment** and have necessary permissions. ";
                errorMessage += "Options: \n";
                errorMessage += "1. **Local Dev:** Run `gcloud auth application-default login` in your terminal.\n";
                errorMessage += "2. **Server/VM:** Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the path of your service account key file.\n";
                errorMessage += "3. **Google Cloud Platform (Cloud Run, Functions, App Engine, GKE):** Ensure the runtime service account has the 'Cloud Text-to-Speech API User' role (or 'roles/cloudtts.serviceAgent').\n";
                errorMessage += `Original Error Details: ${error.message}`;
             } else if (error.message.includes('Quota') || error.message.includes('rate limit') || (error.code && error.code === 8) /* RESOURCE_EXHAUSTED */) {
                 errorMessage += ' API quota or rate limit exceeded. Check your Google Cloud project quotas for the Text-to-Speech API.';
             } else if (error.message.includes('invalid argument') && error.message.includes('Voice name')) {
                 errorMessage += ` Invalid voice name specified: '${input.voiceName}'. Please check available voices for language '${input.languageCode}'.`;
             } else if (error.code && error.code === 3 /* INVALID_ARGUMENT */) {
                  errorMessage += ` Invalid argument provided to the API. Check input text length, language code, or voice name. Details: ${error.message}`;
             } else if (error.code && error.code === 7 /* PERMISSION_DENIED */) {
                  errorMessage += ` Permission denied. The authenticated principal (user or service account) lacks the necessary IAM permissions for Google Cloud Text-to-Speech. Ensure it has the 'Cloud Text-to-Speech API User' role. Details: ${error.message}`;
             }
             // Include the original error message for more details if not already covered
             if (errorMessage === 'Failed to generate voice over audio using Google Cloud TTS.') {
                 errorMessage += ` Details: ${error.message}`;
             }
         } else {
             errorMessage += ' An unexpected error occurred.';
         }

         console.error("Final Error Message to Throw:", errorMessage); // Log the detailed error message
         throw new Error(errorMessage); // Throw the user-friendly message
     }
     // No finally block needed for temp file cleanup as we are not saving to disk anymore
});
