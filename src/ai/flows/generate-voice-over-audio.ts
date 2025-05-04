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
// Removed Google Cloud Text-to-Speech import

// --- Constants ---
const UNREALSPEECH_API_KEY = process.env.UNREALSPEECH_API_KEY || '8wVOSocqw9y9XjY07PCFjeD2ezLZgAULrXjcc0VeGnWR4Qdz5Kg7E1'; // Use environment variable or fallback to the provided key
const UNREALSPEECH_API_BASE_URL = 'https://api.v8.unrealspeech.com/api/v1';
const POLLING_INTERVAL_MS = 3000; // Poll every 3 seconds
const MAX_POLLING_ATTEMPTS = 20; // Maximum polling attempts (e.g., 20 * 3s = 1 minute timeout)

const GenerateVoiceOverAudioInputSchema = z.object({
  articleText: z
    .string()
    .min(1, "Article text cannot be empty.")
    .describe('The formatted article text to generate voice-over audio from.'),
  voiceId: z.string().optional().default('Liv').describe('UnrealSpeech Voice ID (e.g., Dan, Will, Liv, Amy)'),
  // bitrate: z.string().optional().default('192k').describe('Audio bitrate (e.g., 192k, 128k)'),
  // speed: z.number().optional().default(0).min(-1.0).max(1.0).describe('Playback speed adjustment (-1.0 to 1.0)'),
  // pitch: z.number().optional().default(1.0).min(0.0).max(2.0).describe('Voice pitch (0.0 to 2.0)'),
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
      throw new Error('UnrealSpeech API key is not configured. Please set the UNREALSPEECH_API_KEY environment variable.');
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
async (input: GenerateVoiceOverAudioInput): Promise<GenerateVoiceOverAudioOutput> => {
    if (!input.articleText || input.articleText.trim().length === 0) {
        throw new Error('Article text cannot be empty.');
    }
    if (!UNREALSPEECH_API_KEY) {
      throw new Error('UnrealSpeech API key is missing.'); // Should be caught earlier, but double-check
    }

    console.log(`Starting UnrealSpeech TTS Flow for text starting with: "${input.articleText.substring(0, 50)}..." using voice: ${input.voiceId}`);

    let synthesisTaskId: string | null = null;

    try {
        // --- Step 1: Create Synthesis Task ---
        console.log("Calling UnrealSpeech API: Create Synthesis Task...");
        const createResponse = await fetch(`${UNREALSPEECH_API_BASE_URL}/synthesisTasks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${UNREALSPEECH_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                Text: input.articleText,
                VoiceId: input.voiceId || 'Liv', // Default to Liv if not provided
                // Bitrate: input.bitrate || '192k',
                // Speed: input.speed || 0,
                // Pitch: input.pitch || 1.0,
                OutputFormat: 'mp3' // Request MP3 format
            }),
        });

        if (!createResponse.ok) {
            const errorBody = await createResponse.text();
            console.error(`UnrealSpeech API Error (Create Task - ${createResponse.status}): ${errorBody}`);
            throw new Error(`UnrealSpeech API failed to create task (${createResponse.status}): ${errorBody || createResponse.statusText}`);
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

            console.log(`Polling attempt ${attempts}/${MAX_POLLING_ATTEMPTS} for task ${synthesisTaskId}...`);
            const pollResponse = await fetch(`${UNREALSPEECH_API_BASE_URL}/synthesisTasks/${synthesisTaskId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${UNREALSPEECH_API_KEY}`,
                },
            });

            if (!pollResponse.ok) {
                 // Handle potential 404 if task ID is wrong or temporary issues
                 if (pollResponse.status === 404) {
                    console.error(`UnrealSpeech API Error: Task ${synthesisTaskId} not found.`);
                    throw new Error(`UnrealSpeech Synthesis Task ${synthesisTaskId} not found.`);
                 }
                const errorBody = await pollResponse.text();
                console.warn(`UnrealSpeech API Polling Warning (${pollResponse.status}): ${errorBody}. Retrying...`);
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
        const audioResponse = await fetch(outputUri);

        if (!audioResponse.ok) {
            const errorBody = await audioResponse.text();
            console.error(`Failed to download audio from UnrealSpeech OutputUri (${audioResponse.status}): ${errorBody}`);
            throw new Error(`Failed to download generated audio (${audioResponse.status}): ${errorBody || audioResponse.statusText}`);
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

        // Check if it's an error thrown by the flow itself or a network/API error
        if (error instanceof Error) {
            const msg = error.message.toLowerCase();
            if (msg.includes('unrealspeech api failed') || msg.includes('timed out') || msg.includes('failed to download')) {
                errorMessage = error.message; // Use the specific error message
            } else if (msg.includes('unauthorized') || msg.includes('invalid api key')) {
                 errorMessage += ' Check your UnrealSpeech API key.';
            } else if (msg.includes('quota') || msg.includes('limit')) {
                 errorMessage += ' You might have exceeded your UnrealSpeech API quota.';
            }
             else {
                 errorMessage += ` Details: ${error.message}`;
             }
        } else {
             errorMessage += ' An unexpected error occurred.';
        }
        console.error("Formatted Error Message:", errorMessage);
        throw new Error(errorMessage);
    }
    // No finally block needed as fetch doesn't require explicit closing like the Google client
});
