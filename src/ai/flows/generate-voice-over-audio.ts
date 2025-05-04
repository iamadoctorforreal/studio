'use server';

/**
 * @fileOverview A voice-over audio generation AI agent using UnrealSpeech API.
 *
 * - generateVoiceOverAudio - A function that generates voice-over audio from the formatted article.
 * - GenerateVoiceOverAudioInput - The input type for the generateVoiceOverAudio function.
 * - GenerateVoiceOverAudioOutput - The return type for the generateVoiceOverAudio function.
 *
 * NOTE: This flow uses the UnrealSpeech API (https://docs.v8.unrealspeech.com).
 * It requires an API key.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';

// --- Constants ---
// Prefer environment variable, but use the provided key as a fallback
const UNREALSPEECH_API_KEY = process.env.UNREALSPEECH_API_KEY || '8wVOSocqw9y9XjY07PCFjeD2ezLZgAULrXjcc0VeGnWR4Qdz5Kg7E1';
const UNREALSPEECH_API_BASE_URL = 'https://api.v8.unrealspeech.com/api/v1';
const POLLING_INTERVAL_MS = 3000; // Poll every 3 seconds
const MAX_POLLING_ATTEMPTS = 20; // Maximum polling attempts (e.g., 20 * 3s = 1 minute timeout)

const GenerateVoiceOverAudioInputSchema = z.object({
  articleText: z
    .string()
    .min(1, "Article text cannot be empty.")
    .describe('The formatted article text to generate voice-over audio from.'),
  voiceId: z.string().optional().default('Liv').describe('UnrealSpeech Voice ID (e.g., Dan, Will, Liv, Amy)'),
});
export type GenerateVoiceOverAudioInput = z.infer<typeof GenerateVoiceOverAudioInputSchema>;

const GenerateVoiceOverAudioOutputSchema = z.object({
  audioDataUri: z.string().describe('The generated voice-over audio as a base64 data URI (e.g., data:audio/mpeg;base64,...).'),
});
export type GenerateVoiceOverAudioOutput = z.infer<typeof GenerateVoiceOverAudioOutputSchema>;

/**
 * Helper function to convert ArrayBuffer to Data URI
 * @param buffer The audio ArrayBuffer received from the download.
 * @param mimeType The MIME type of the audio (e.g., 'audio/mpeg').
 * @returns The data URI string.
 */
function bufferToDataURI(buffer: ArrayBuffer, mimeType: string): string {
    const base64String = Buffer.from(buffer).toString('base64');
    return `data:${mimeType};base64,${base64String}`;
}

/**
 * Helper function to introduce delays.
 * @param ms Milliseconds to wait.
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


export async function generateVoiceOverAudio(
  input: GenerateVoiceOverAudioInput
): Promise<GenerateVoiceOverAudioOutput> {
  // Validate input using Zod before calling the flow
  const validatedInput = GenerateVoiceOverAudioInputSchema.parse(input);
  if (!UNREALSPEECH_API_KEY) {
      console.error('UnrealSpeech API key is missing or not configured.');
      throw new Error('UnrealSpeech API key is not configured. Please set the UNREALSPEECH_API_KEY environment variable or ensure the fallback key is correct.');
  }
  // Log the key being used (mask parts of it for security if logging publicly)
  // console.log(`Using UnrealSpeech API Key starting with: ${UNREALSPEECH_API_KEY.substring(0, 4)}...`);
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
    if (!UNREALSPEECH_API_KEY) {
      // This should have been caught earlier, but provides an extra layer of safety.
      console.error('UnrealSpeech API key is missing inside the flow.');
      throw new Error('UnrealSpeech API key is missing.');
    }

    console.log(`Starting UnrealSpeech TTS Flow for text starting with: "${input.articleText.substring(0, 50)}..." using voice: ${input.voiceId}`);

    let synthesisTaskId: string | null = null;

    try {
        // --- Step 1: Create Synthesis Task ---
        const requestUrl = `${UNREALSPEECH_API_BASE_URL}/synthesisTasks`;
        const requestBody = {
            Text: input.articleText,
            VoiceId: input.voiceId || 'Liv', // Default to Liv if not provided
            OutputFormat: 'mp3' // Request MP3 format
        };
        const requestHeaders = {
             // Ensure the Bearer token format is correct
            'Authorization': `Bearer ${UNREALSPEECH_API_KEY}`,
            'Content-Type': 'application/json',
        };

        console.log(`Calling UnrealSpeech API: POST ${requestUrl}`);
        // console.log("Request Headers:", JSON.stringify(requestHeaders)); // Be cautious logging full headers if sensitive
        // console.log("Request Body:", JSON.stringify(requestBody));

        const createResponse = await fetch(requestUrl, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(requestBody),
        });

        if (!createResponse.ok) {
            const errorStatus = createResponse.status;
            const errorStatusText = createResponse.statusText;
            let errorBody = 'Could not read error body.';
            try {
                errorBody = await createResponse.text();
            } catch (e) {
                console.warn("Failed to read error response body.");
            }

            console.error(`UnrealSpeech API Error (Create Task - ${errorStatus} ${errorStatusText}): ${errorBody}`);

            // Provide more specific error message for 403
            if (errorStatus === 403) {
                 throw new Error(`UnrealSpeech API request failed with status 403 Forbidden. This usually means the API key is invalid, expired, or lacks permissions. Please verify your key (${UNREALSPEECH_API_KEY.substring(0,4)}...) and account status.`);
            } else {
                 throw new Error(`UnrealSpeech API failed to create task (${errorStatus} ${errorStatusText}): ${errorBody}`);
            }
        }

        const createTaskResult = await createResponse.json();
        synthesisTaskId = createTaskResult?.SynthesisTask?.SynthesisTaskId;

        if (!synthesisTaskId) {
             console.error("UnrealSpeech API did not return a SynthesisTaskId.", createTaskResult);
             throw new Error('UnrealSpeech API did not return a Synthesis Task ID.');
        }
        console.log(`UnrealSpeech Synthesis Task created with ID: ${synthesisTaskId}`);

        // --- Step 2: Poll for Task Completion ---
        let attempts = 0;
        let taskStatus: string | null = null;
        let outputUri: string | null = null;

        console.log("Polling UnrealSpeech API for task status...");
        while (attempts < MAX_POLLING_ATTEMPTS) {
            attempts++;
            await delay(POLLING_INTERVAL_MS); // Wait before polling

            const pollUrl = `${UNREALSPEECH_API_BASE_URL}/synthesisTasks/${synthesisTaskId}`;
            console.log(`Polling attempt ${attempts}/${MAX_POLLING_ATTEMPTS}: GET ${pollUrl}`);

            const pollResponse = await fetch(pollUrl, {
                method: 'GET',
                headers: {
                     // Also needs Authorization for polling
                    'Authorization': `Bearer ${UNREALSPEECH_API_KEY}`,
                },
            });

            if (!pollResponse.ok) {
                const errorStatus = pollResponse.status;
                const errorStatusText = pollResponse.statusText;
                 let errorBody = 'Could not read error body.';
                 try {
                    errorBody = await pollResponse.text();
                 } catch (e) {
                    console.warn("Failed to read polling error response body.");
                 }

                 // Handle potential 404 if task ID is wrong or temporary issues
                 if (pollResponse.status === 404) {
                    console.error(`UnrealSpeech API Error: Task ${synthesisTaskId} not found (404).`);
                    throw new Error(`UnrealSpeech Synthesis Task ${synthesisTaskId} not found.`);
                 }
                 // Handle 403 on polling too
                 if (errorStatus === 403) {
                     console.error(`UnrealSpeech API Polling Error (403 Forbidden): ${errorBody}`);
                     throw new Error(`UnrealSpeech API polling failed with status 403 Forbidden. Check API key permissions.`);
                 }
                 console.warn(`UnrealSpeech API Polling Warning (${errorStatus} ${errorStatusText}): ${errorBody}. Retrying...`);
                 // Continue polling on transient errors, but maybe add more specific error handling
                 continue;
            }

            const pollResult = await pollResponse.json();
            taskStatus = pollResult?.SynthesisTask?.TaskStatus;
            outputUri = pollResult?.SynthesisTask?.OutputUri;

            console.log(`Task ${synthesisTaskId} status: ${taskStatus}`);

            if (taskStatus === 'Completed') {
                if (!outputUri) {
                    console.error("UnrealSpeech task completed but no OutputUri provided.", pollResult);
                    throw new Error('UnrealSpeech task completed but did not provide an audio URL.');
                }
                console.log(`UnrealSpeech task completed. Audio URI: ${outputUri}`);
                break; // Exit loop
            } else if (taskStatus === 'Failed') {
                 const failureReason = pollResult?.SynthesisTask?.FailureReason || 'Unknown reason';
                 console.error(`UnrealSpeech task ${synthesisTaskId} failed. Reason: ${failureReason}`, pollResult);
                 throw new Error(`UnrealSpeech task failed: ${failureReason}`);
            }
            // Continue polling if status is 'Pending' or 'Processing'
        }

        if (taskStatus !== 'Completed') {
             console.error(`UnrealSpeech task ${synthesisTaskId} timed out after ${attempts} attempts.`);
             throw new Error(`UnrealSpeech task timed out. Last status: ${taskStatus || 'Unknown'}.`);
        }

        // --- Step 3: Download Audio from OutputUri ---
        if (!outputUri) {
             // This case should technically be caught earlier, but safety check
             throw new Error("Output URI is missing after task completion.");
        }
        console.log(`Downloading audio from UnrealSpeech OutputUri: ${outputUri}`);
        // Note: OutputUri is usually a presigned URL and doesn't need extra auth headers
        const audioResponse = await fetch(outputUri);

        if (!audioResponse.ok) {
             const errorStatus = audioResponse.status;
             const errorStatusText = audioResponse.statusText;
             let errorBody = 'Could not read download error body.';
             try {
                 errorBody = await audioResponse.text();
             } catch (e) {
                  console.warn("Failed to read download error response body.");
             }
            console.error(`Failed to download audio from UnrealSpeech OutputUri (${errorStatus} ${errorStatusText}): ${errorBody}`);
            throw new Error(`Failed to download generated audio (${errorStatus} ${errorStatusText}): ${errorBody}`);
        }

        // --- Step 4: Convert to Data URI ---
        const audioArrayBuffer = await audioResponse.arrayBuffer();
        if (audioArrayBuffer.byteLength === 0) {
            console.error('Received empty audio buffer from UnrealSpeech download.');
            throw new Error('Downloaded audio file is empty.');
        }
        console.log(`Received audio buffer of size: ${audioArrayBuffer.byteLength} bytes.`);

        const audioDataUri = bufferToDataURI(audioArrayBuffer, 'audio/mpeg'); // UnrealSpeech provides MP3
        console.log("Successfully converted audio buffer to Data URI.");

        return { audioDataUri };

    } catch (error: any) {
        console.error('Error caught in generateVoiceOverAudioFlow (UnrealSpeech):', error);
        let errorMessage = 'Failed to generate voice over audio using UnrealSpeech.';

        // Use the specific error message if it's one of our custom ones
        if (error instanceof Error) {
             if (error.message.startsWith('UnrealSpeech API') || error.message.startsWith('Failed to download')) {
                errorMessage = error.message; // Use the specific error message thrown above
            } else {
                 // Handle other generic errors
                 errorMessage += ` Details: ${error.message}`;
            }
        } else {
             errorMessage += ' An unexpected error occurred.';
        }
        console.error("Formatted Error Message to Throw:", errorMessage);
        throw new Error(errorMessage); // Re-throw the processed error message
    }
});
