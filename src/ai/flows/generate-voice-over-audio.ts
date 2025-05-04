
'use server';

/**
 * @fileOverview A voice-over audio generation AI agent using UnrealSpeech API (asynchronous task endpoint).
 *
 * - generateVoiceOverAudio - A function that generates voice-over audio from the formatted article.
 * - GenerateVoiceOverAudioInput - The input type for the generateVoiceOverAudio function.
 * - GenerateVoiceOverAudioOutput - The return type for the generateVoiceOverAudio function.
 *
 * NOTE: This flow uses the UnrealSpeech API (https://docs.v8.unrealspeech.com).
 * It requires an API key. This implementation uses the asynchronous /synthesisTasks endpoint.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';

// --- Constants ---
// Prefer environment variable, but use the provided key as a fallback for demonstration
const UNREALSPEECH_API_KEY = process.env.UNREALSPEECH_API_KEY || '8wVOSocqw9y9XjY07PCFjeD2ezLZgAULrXjcc0VeGnWR4Qdz5Kg7E1';
const UNREALSPEECH_API_BASE_URL = 'https://api.v8.unrealspeech.com/api/v1'; // Use v1 base path
const POLLING_INTERVAL_MS = 5000; // Poll every 5 seconds (adjust as needed)
const MAX_POLLING_ATTEMPTS = 30; // Max attempts (e.g., 30 * 5s = 2.5 minutes timeout - adjust based on expected processing time)

const GenerateVoiceOverAudioInputSchema = z.object({
  articleText: z
    .string()
    .min(1, "Article text cannot be empty.")
    // Max length check based on UnrealSpeech documentation (500k chars)
    .max(500000, "Article text exceeds the maximum allowed length (500,000 characters).")
    .describe('The formatted article text to generate voice-over audio from.'),
  voiceId: z.string().optional().default('Liv').describe('UnrealSpeech Voice ID (e.g., Dan, Will, Liv, Amy, Sierra)'),
  bitrate: z.string().optional().default('192k').describe('Audio bitrate (e.g., 64k, 128k, 192k, 320k)'),
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
    // Ensure Buffer is available (should be in Node.js environment)
    if (typeof Buffer === 'undefined') {
        throw new Error("Buffer API is not available in this environment.");
    }
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
  // Log the source of the key (env or fallback) and partially mask it for security
  const keySource = process.env.UNREALSPEECH_API_KEY ? 'environment variable' : 'fallback';
  const maskedKey = UNREALSPEECH_API_KEY.substring(0, 4) + '...' + UNREALSPEECH_API_KEY.substring(UNREALSPEECH_API_KEY.length - 4);
  console.log(`Using UnrealSpeech API Key from ${keySource}, Key: ${maskedKey}`);

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
     if (input.articleText.length > 500000) {
        throw new Error('Article text exceeds the maximum allowed length (500,000 characters).');
    }
    if (!UNREALSPEECH_API_KEY) {
      // This should have been caught earlier, but provides an extra layer of safety.
      console.error('UnrealSpeech API key is missing inside the flow.');
      throw new Error('UnrealSpeech API key is missing.');
    }

    console.log(`Starting UnrealSpeech TTS Flow (/synthesisTasks) for text (${input.articleText.length} chars) starting with: "${input.articleText.substring(0, 50)}..." using voice: ${input.voiceId}, bitrate: ${input.bitrate}`);

    let synthesisTaskId: string | null = null;

    try {
        // --- Step 1: Create Synthesis Task ---
        const requestUrl = `${UNREALSPEECH_API_BASE_URL}/synthesisTasks`;
        // Body according to /synthesisTasks documentation
        const requestBody = {
            Text: [input.articleText], // Send text as an array of strings as recommended for longer text
            VoiceId: input.voiceId || 'Liv', // Default to Liv if not provided
            Bitrate: input.bitrate || '192k',
            OutputFormat: 'uri', // Explicitly ask for URI output format (should be default for this endpoint)
            TimestampType: 'sentence' // 'word' or 'sentence' - using sentence as default
            // CallbackUrl: Optional callback URL if needed
        };
        const requestHeaders = {
             // Ensure the Bearer token format is correct
            'Authorization': `Bearer ${UNREALSPEECH_API_KEY}`,
            'Content-Type': 'application/json',
        };

        console.log(`Calling UnrealSpeech API: POST ${requestUrl}`);
        console.log("Request Body:", JSON.stringify({ ...requestBody, Text: [`${input.articleText.substring(0, 50)}... (${input.articleText.length} chars)`] })); // Log sanitized body

        const createResponse = await fetch(requestUrl, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(requestBody),
        });

        const responseBodyText = await createResponse.text(); // Read body once for logging/parsing

        if (!createResponse.ok) {
            const errorStatus = createResponse.status;
            const errorStatusText = createResponse.statusText;

            console.error(`UnrealSpeech API Error (Create Task - ${errorStatus} ${errorStatusText}): ${responseBodyText}`);

            // Provide more specific error message based on status code
            let userMessage = `UnrealSpeech API failed to create task (${errorStatus} ${errorStatusText}).`;
            if (errorStatus === 400) {
                userMessage = `UnrealSpeech API Error (400 Bad Request): Invalid input data. Check text length, voice ID, or other parameters. Details: ${responseBodyText}`;
            } else if (errorStatus === 401 || errorStatus === 403) {
                 const keySource = process.env.UNREALSPEECH_API_KEY ? 'environment variable' : 'fallback key';
                 const maskedKey = UNREALSPEECH_API_KEY.substring(0, 4) + '...' + UNREALSPEECH_API_KEY.substring(UNREALSPEECH_API_KEY.length - 4);
                 userMessage = `UnrealSpeech API Error (${errorStatus}): Authentication failed. This usually means the API key (from ${keySource}, value: ${maskedKey}) is invalid, expired, or lacks permissions. Please verify your key and account status. Details: ${responseBodyText}`;
            } else if (errorStatus === 429) {
                userMessage = `UnrealSpeech API Error (429 Too Many Requests): Rate limit exceeded. Please wait and try again later. Details: ${responseBodyText}`;
            } else if (errorStatus >= 500) {
                userMessage = `UnrealSpeech API Error (${errorStatus}): Server error. Please try again later. Details: ${responseBodyText}`;
            }
            throw new Error(userMessage);
        }

        let createTaskResult;
        try {
            createTaskResult = JSON.parse(responseBodyText);
        } catch (e) {
             console.error("Failed to parse UnrealSpeech create task response JSON:", responseBodyText, e);
            throw new Error('Failed to parse response from UnrealSpeech API after creating task.');
        }

        synthesisTaskId = createTaskResult?.SynthesisTask?.TaskId; // Adjusted path based on docs

        if (!synthesisTaskId) {
             console.error("UnrealSpeech API did not return a TaskId.", createTaskResult);
             throw new Error('UnrealSpeech API did not return a Synthesis Task ID.');
        }
        console.log(`UnrealSpeech Synthesis Task created with ID: ${synthesisTaskId}`);

        // --- Step 2: Poll for Task Completion ---
        let attempts = 0;
        let taskStatus: string | null = null;
        let outputUriList: string[] | null = null; // OutputUri is an array

        console.log(`Polling UnrealSpeech API for task ${synthesisTaskId} status...`);
        while (attempts < MAX_POLLING_ATTEMPTS) {
            attempts++;
            await delay(POLLING_INTERVAL_MS); // Wait before polling

            const pollUrl = `${UNREALSPEECH_API_BASE_URL}/synthesisTasks/${synthesisTaskId}`;
            console.log(`Polling attempt ${attempts}/${MAX_POLLING_ATTEMPTS}: GET ${pollUrl}`);

            let pollResponse: Response;
            try {
                 pollResponse = await fetch(pollUrl, {
                    method: 'GET',
                    headers: {
                        // Also needs Authorization for polling
                        'Authorization': `Bearer ${UNREALSPEECH_API_KEY}`,
                    },
                 });
            } catch (networkError: any) {
                 console.warn(`Network error during polling attempt ${attempts}: ${networkError.message}. Retrying...`);
                 continue; // Skip this attempt and retry after delay
            }


             const pollResponseBodyText = await pollResponse.text(); // Read body once

            if (!pollResponse.ok) {
                const errorStatus = pollResponse.status;
                const errorStatusText = pollResponse.statusText;

                 // Handle potential 404 if task ID is wrong or task expired
                 if (pollResponse.status === 404) {
                    console.error(`UnrealSpeech API Error: Task ${synthesisTaskId} not found (404). It might be invalid or expired. Body: ${pollResponseBodyText}`);
                    throw new Error(`UnrealSpeech Synthesis Task ${synthesisTaskId} not found. It might be invalid or have expired.`);
                 }
                 // Handle auth errors on polling too
                 if (errorStatus === 401 || errorStatus === 403) {
                     const keySource = process.env.UNREALSPEECH_API_KEY ? 'environment variable' : 'fallback key';
                     const maskedKey = UNREALSPEECH_API_KEY.substring(0, 4) + '...' + UNREALSPEECH_API_KEY.substring(UNREALSPEECH_API_KEY.length - 4);
                     console.error(`UnrealSpeech API Polling Error (${errorStatus}): Authentication failed. Check API key (from ${keySource}, value: ${maskedKey}) permissions. Body: ${pollResponseBodyText}`);
                     throw new Error(`UnrealSpeech API polling failed (${errorStatus}). Check API key permissions.`);
                 }
                 // Log other non-fatal errors and continue polling
                 console.warn(`UnrealSpeech API Polling Warning (${errorStatus} ${errorStatusText}): ${pollResponseBodyText}. Retrying...`);
                 continue;
            }

             let pollResult;
             try {
                 pollResult = JSON.parse(pollResponseBodyText);
             } catch (e) {
                 console.error(`Failed to parse UnrealSpeech polling response JSON (Attempt ${attempts}): ${pollResponseBodyText}`, e);
                 // Decide if this is fatal or transient. Let's treat it as transient for now.
                 console.warn("Continuing polling despite JSON parse error.");
                 continue;
             }


            taskStatus = pollResult?.SynthesisTask?.TaskStatus;
            outputUriList = pollResult?.SynthesisTask?.OutputUri; // OutputUri is array

            console.log(`Task ${synthesisTaskId} status: ${taskStatus}`);

            if (taskStatus === 'completed') { // Status is lowercase 'completed'
                if (!outputUriList || !Array.isArray(outputUriList) || outputUriList.length === 0 || !outputUriList[0]) {
                    console.error("UnrealSpeech task completed but no valid OutputUri provided in the array.", pollResult);
                    throw new Error('UnrealSpeech task completed but did not provide a valid audio URL in the expected array format.');
                }
                console.log(`UnrealSpeech task completed. Audio URIs: ${JSON.stringify(outputUriList)}`);
                break; // Exit loop
            } else if (taskStatus === 'failed') { // Status is lowercase 'failed'
                 const failureReason = pollResult?.SynthesisTask?.FailureReason || pollResult?.SynthesisTask?.StatusDetails || 'Unknown reason';
                 console.error(`UnrealSpeech task ${synthesisTaskId} failed. Reason: ${failureReason}`, pollResult);
                 throw new Error(`UnrealSpeech task failed: ${failureReason}`);
            }
            // Continue polling if status is 'scheduled', 'pending', 'processing', or similar in-progress states
        }

        if (taskStatus !== 'completed') {
             console.error(`UnrealSpeech task ${synthesisTaskId} did not complete after ${attempts} attempts (Timeout: ${MAX_POLLING_ATTEMPTS * POLLING_INTERVAL_MS / 1000}s). Last status: ${taskStatus || 'Unknown'}.`);
             throw new Error(`UnrealSpeech task timed out after ${MAX_POLLING_ATTEMPTS * POLLING_INTERVAL_MS / 1000} seconds. Last status: ${taskStatus || 'Unknown'}.`);
        }

        // --- Step 3: Download Audio from the first OutputUri ---
        // Assuming we only sent one text chunk and expect one audio file
        const audioUrl = outputUriList?.[0];
        if (!audioUrl) {
             // This case should technically be caught earlier, but safety check
             throw new Error("Output URI array is missing or empty after task completion.");
        }
        console.log(`Downloading audio from UnrealSpeech OutputUri: ${audioUrl}`);
        // Note: OutputUri is usually a presigned URL and doesn't need extra auth headers

        let audioResponse: Response;
        try {
             audioResponse = await fetch(audioUrl);
        } catch (downloadError: any) {
             console.error(`Network error downloading audio from ${audioUrl}: ${downloadError.message}`);
             throw new Error(`Failed to initiate download for the generated audio. Network error: ${downloadError.message}`);
        }


        if (!audioResponse.ok) {
             const errorStatus = audioResponse.status;
             const errorStatusText = audioResponse.statusText;
             let errorBody = `Could not read download error body (Status: ${errorStatus})`;
             try {
                 errorBody = await audioResponse.text();
             } catch (e) {
                  console.warn("Failed to read download error response body.");
             }
            console.error(`Failed to download audio from UnrealSpeech OutputUri (${errorStatus} ${errorStatusText}): ${errorBody}`);
            throw new Error(`Failed to download generated audio. Server responded with ${errorStatus} ${errorStatusText}. Details: ${errorBody}`);
        }

        // --- Step 4: Convert to Data URI ---
        let audioArrayBuffer: ArrayBuffer;
        try {
             audioArrayBuffer = await audioResponse.arrayBuffer();
        } catch (bufferError: any) {
             console.error(`Error converting audio response to ArrayBuffer: ${bufferError.message}`);
             throw new Error(`Failed to read the downloaded audio data. Error: ${bufferError.message}`);
        }


        if (audioArrayBuffer.byteLength === 0) {
            console.error('Received empty audio buffer from UnrealSpeech download.');
            throw new Error('Downloaded audio file is empty.');
        }
        console.log(`Received audio buffer of size: ${audioArrayBuffer.byteLength} bytes.`);

        const audioDataUri = bufferToDataURI(audioArrayBuffer, 'audio/mpeg'); // UnrealSpeech provides MP3 by default for URI output
        console.log("Successfully converted audio buffer to Data URI.");

        return { audioDataUri };

    } catch (error: any) {
        console.error('Error caught in generateVoiceOverAudioFlow (UnrealSpeech /synthesisTasks):', error);
        let errorMessage = 'Failed to generate voice over audio using UnrealSpeech.';

        // Use the specific error message if it's one of our custom ones or standard Error
        if (error instanceof Error) {
             // Keep specific messages from API calls, download, timeout, etc.
             if (error.message.startsWith('UnrealSpeech') || error.message.startsWith('Failed to download') || error.message.startsWith('Downloaded audio file is empty') || error.message.startsWith('Failed to read') || error.message.startsWith('Failed to parse')) {
                errorMessage = error.message;
             } else {
                 // Handle other generic errors
                 errorMessage += ` Details: ${error.message}`;
             }
        } else {
             // Handle cases where non-Error objects might be thrown
             errorMessage += ' An unexpected non-error object was thrown.';
             console.error("Unexpected throw type:", error);
        }
        console.error("Final Error Message to Throw:", errorMessage);
        // Ensure we throw a real Error object
        throw new Error(errorMessage);
    }
});

    