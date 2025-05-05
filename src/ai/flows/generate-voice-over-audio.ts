
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
let ttsInitializationError: Error | null = null; // Store initialization error

try {
    console.log("Attempting to initialize Google Cloud Text-to-Speech client...");
    ttsClient = new textToSpeech.TextToSpeechClient();
    console.log("Google Cloud Text-to-Speech client initialized successfully.");
    // Test connection (optional, but can help diagnose early)
    // Note: listVoices is a relatively lightweight call.
    ttsClient.listVoices({}).then(() => {
        console.log("Successfully listed voices, confirming TTS API connectivity.");
    }).catch(testError => {
        console.warn("Warning: Initial listVoices call failed after client initialization. This might indicate a potential authentication or network issue.", testError.message);
        // Do not set ttsInitializationError here unless it's a critical failure pattern
    });
} catch (initError: any) {
    ttsInitializationError = initError; // Store the error
    console.error("FATAL: Failed to initialize Google Cloud Text-to-Speech client.", initError);
    // Log detailed message
     let initErrorMessage = "FATAL ERROR initializing Google Cloud TTS Client. ";
     if (initError.message.includes('Could not load the default credentials') || initError.message.includes('Could not refresh access token')) {
         initErrorMessage += "Authentication failed during client initialization. Ensure Application Default Credentials (ADC) are configured correctly in the server environment. For local development, run `gcloud auth application-default login`. For servers/VMs, set the GOOGLE_APPLICATION_CREDENTIALS environment variable pointing to your service account key file. On Google Cloud platforms (Cloud Run, Functions, App Engine, GKE), ensure the runtime service account has the 'roles/cloudtts.serviceAgent' role.";
     } else if (initError.message.includes('metadata plugin')) {
          initErrorMessage += "Metadata service error. This often happens in environments without standard Google Cloud metadata access (like local dev without gcloud auth login). Ensure ADC is configured correctly.";
     } else {
         initErrorMessage += `Details: ${initError.message}`;
     }
     console.error(initErrorMessage);
     // We don't throw here, but the generate flow will fail if the client is null or the initialization error is present.
}


const GenerateVoiceOverAudioInputSchema = z.object({
  articleText: z
    .string()
    .min(1, "Article text cannot be empty.")
    // Google Cloud TTS has limits, e.g., 5000 bytes per request for standard API
    // We handle splitting, but keep a reasonable overall limit.
    .max(100000, "Article text is very long, consider breaking it down further if issues arise.")
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
    // Also split by double newline to respect paragraph breaks more reliably.
    const segments = text.split(/((?<=[.!?])(?:\s+|\n)|\n\n)/).filter(s => s && s.trim().length > 0);

    for (const segment of segments) {
        const trimmedSegment = segment.trim();
        if (trimmedSegment.length === 0) continue;

        // If a single segment (sentence or paragraph) is too long, split it hard
        if (trimmedSegment.length > limit) {
            console.warn(`Single segment exceeds limit (${trimmedSegment.length}/${limit}). Splitting mid-segment.`);
            if (currentChunk) { // Add the current chunk before the long segment
                chunks.push(currentChunk);
                currentChunk = '';
            }
            // Hard split the long segment
            for (let i = 0; i < trimmedSegment.length; i += limit) {
                chunks.push(trimmedSegment.substring(i, i + limit));
            }
        } else if (currentChunk.length + trimmedSegment.length + 1 <= limit) { // +1 for potential space/newline
            // Add segment with a space unless current chunk is empty or ends with newline
            const separator = currentChunk && !currentChunk.endsWith('\n') ? ' ' : '';
            currentChunk += separator + trimmedSegment;
        } else {
            // Current chunk is full, push it and start a new one
            chunks.push(currentChunk);
            currentChunk = trimmedSegment;
        }
    }

    // Add the last remaining chunk
    if (currentChunk) {
        chunks.push(currentChunk);
    }

    // Filter out any potentially empty chunks created during splitting
    return chunks.filter(chunk => chunk.length > 0);
}


export async function generateVoiceOverAudio(
  input: GenerateVoiceOverAudioInput
): Promise<GenerateVoiceOverAudioOutput> {
  // Validate input using Zod before calling the flow
  const validatedInput = GenerateVoiceOverAudioInputSchema.parse(input);

  // Check if the client failed to initialize at startup
   if (!ttsClient || ttsInitializationError) {
       let initErrorMessage = "Google Cloud Text-to-Speech client initialization failed. ";
       if (ttsInitializationError) {
            if (ttsInitializationError.message.includes('Could not load the default credentials') || ttsInitializationError.message.includes('Could not refresh access token')) {
               initErrorMessage += "Authentication failed during startup. Ensure Application Default Credentials (ADC) are configured correctly in the server environment. \n";
               initErrorMessage += "**Troubleshooting Steps:**\n";
               initErrorMessage += "1. **Local Development:** Run `gcloud auth application-default login` in your terminal.\n";
               initErrorMessage += "2. **Server/VM:** Ensure the `GOOGLE_APPLICATION_CREDENTIALS` environment variable is set correctly, pointing to your service account key file.\n";
               initErrorMessage += "3. **Google Cloud Platform (Cloud Run, Functions, App Engine, GKE):** Verify the runtime service account has the 'Cloud Text-to-Speech API User' role (or 'roles/cloudtts.serviceAgent').\n";
               initErrorMessage += `   Original Error: ${ttsInitializationError.message}`;
           } else if (ttsInitializationError.message.includes('metadata plugin')) {
                 initErrorMessage += "Metadata service error during initialization. Ensure ADC is configured (see steps above).";
                 initErrorMessage += `   Original Error: ${ttsInitializationError.message}`;
           } else {
               initErrorMessage += `Details: ${ttsInitializationError.message}`;
           }
       } else {
           initErrorMessage += "Client is null, initialization may have failed silently. Check server logs.";
       }
       console.error("Pre-flow Check Failed:", initErrorMessage);
       throw new Error(initErrorMessage); // Throw the specific error here
   }

   console.log("Google Cloud TTS client seems initialized. Proceeding to flow execution.");
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
    // Re-check client status within the flow for robustness, though the wrapper should catch it first.
    if (!ttsClient) {
        // This should ideally not be reached if the pre-check works, but serves as a fallback.
        throw new Error("Google Cloud Text-to-Speech client is not available. Check server startup logs for initialization/authentication errors.");
    }
    if (!input.articleText || input.articleText.trim().length === 0) {
        throw new Error('Article text cannot be empty.');
    }

    console.log(`Starting Google Cloud TTS Flow for text (${input.articleText.length} chars) using voice: ${input.voiceName}, lang: ${input.languageCode}`);

    // Split the input text into manageable chunks
    const textChunks = splitTextIntoChunks(input.articleText, GOOGLE_TTS_MAX_CHARS);
    console.log(`Text split into ${textChunks.length} chunks for synthesis.`);

    if (textChunks.length === 0) {
        console.warn("Text splitting resulted in zero chunks. Input might have been effectively empty.");
        throw new Error("Cannot generate audio from empty text after processing.");
    }

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

            console.log(`Sending request to Google Cloud Text-to-Speech API for chunk ${i + 1}...`);
            // --- Step 1: Call Google Cloud TTS API for the chunk ---
            let response: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechResponse;
            try {
                 [response] = await ttsClient.synthesizeSpeech(request);
                 console.log(`Received response for chunk ${i + 1}`);
            } catch (synthesizeError: any) {
                 console.error(`Error during synthesizeSpeech call for chunk ${i + 1}:`, synthesizeError);
                 // Re-throw the error with context, potentially formatting it better
                 // Pass the original error for more detailed debugging if needed
                  throw new Error(`Google Cloud TTS API request failed for chunk ${i + 1}. Details: ${synthesizeError.message}`);
            }


            if (!response.audioContent) {
                // This case might happen if the API call succeeds but returns no data (unlikely but possible)
                console.warn(`Google Cloud TTS API returned successfully but with no audio content for chunk ${i + 1}. Text was: "${chunk.substring(0,50)}..."`);
                // Decide whether to continue or fail. Let's skip the chunk for now but log a warning.
                // If this becomes problematic, change to throw new Error(...)
                 continue;
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
            // This could happen if all chunks failed the `!response.audioContent` check above.
            throw new Error("No audio buffers were successfully generated. Check API responses and potential issues with all text chunks.");
        }

        const combinedBuffer = Buffer.concat(audioBuffers);
        console.log(`Combined audio buffers into a single buffer (${combinedBuffer.length} bytes).`);

        // --- Step 4: Convert combined buffer to Data URI ---
        const audioDataUri = bufferToDataURI(combinedBuffer, 'audio/mpeg'); // Assuming MP3 encoding
        console.log("Successfully converted combined audio buffer to Data URI.");

        return { audioDataUri };

     } catch (error: any) {
         console.error('Error caught in generateVoiceOverAudioFlow (Google Cloud TTS with chunking):', error);

         // Default error message
         let errorMessage = 'Failed to generate voice over audio using Google Cloud TTS.';

         if (error instanceof Error) {
             // Check for common Google Cloud errors (e.g., authentication, quota, invalid args)
             // Enhanced Authentication/Permission Error Check
              if (error.message.includes('Could not refresh access token') ||
                  error.message.includes('credential') ||
                  error.message.includes('Could not load the default credentials') ||
                  (error.code && (error.code === 7 /* PERMISSION_DENIED */ || error.code === 16 /* UNAUTHENTICATED */)) ||
                  error.message.includes('permission') ||
                  error.message.includes('metadata plugin')) {

                 errorMessage = "Google Cloud TTS Authentication/Permission Error. Ensure Application Default Credentials (ADC) are configured correctly in the **server environment** and have necessary permissions. \n";
                 errorMessage += "**Troubleshooting Steps:**\n";
                 errorMessage += "1. **Local Development:** Run `gcloud auth application-default login` in your terminal.\n";
                 errorMessage += "2. **Server/VM:** Ensure the `GOOGLE_APPLICATION_CREDENTIALS` environment variable is set correctly, pointing to your service account key file.\n";
                 errorMessage += "3. **Google Cloud Platform (Cloud Run, Functions, App Engine, GKE):** Verify the runtime service account has the 'Cloud Text-to-Speech API User' role (or 'roles/cloudtts.serviceAgent').\n";
                 errorMessage += `   Original Error Details: ${error.message}`;

              } else if (error.message.includes('Quota') ||
                         error.message.includes('rate limit') ||
                         (error.code && error.code === 8 /* RESOURCE_EXHAUSTED */)) {
                 errorMessage += ' API quota or rate limit exceeded. Check your Google Cloud project quotas for the Text-to-Speech API.';
                 errorMessage += ` Details: ${error.message}`; // Include original message
              } else if (error.message.includes('invalid argument') && error.message.includes('Voice name')) {
                 errorMessage += ` Invalid voice name specified: '${input.voiceName}'. Please check available voices for language '${input.languageCode}'.`;
                 errorMessage += ` Details: ${error.message}`; // Include original message
              } else if (error.code && error.code === 3 /* INVALID_ARGUMENT */) {
                  errorMessage += ` Invalid argument provided to the API. Check input text length/content, language code, or voice name. Details: ${error.message}`;
              } else {
                  // General error, include the original message
                  errorMessage += ` Details: ${error.message}`;
              }
         } else {
             // Handle cases where the thrown object is not an Error instance
             errorMessage += ` An unexpected error occurred: ${JSON.stringify(error)}`;
         }

         console.error("Final Error Message to Throw:", errorMessage); // Log the detailed error message
         throw new Error(errorMessage); // Throw the potentially more user-friendly message
     }
     // No finally block needed for temp file cleanup as we are not saving to disk anymore
});

    