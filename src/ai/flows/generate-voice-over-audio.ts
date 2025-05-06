
'use server';

/**
 * @fileOverview A voice-over audio generation AI agent using the local edge-tts command-line tool
 *              provided by the @andresaya/edge-tts Node.js package.
 *
 * - generateVoiceOverAudio - A function that generates voice-over audio from the formatted article.
 * - GenerateVoiceOverAudioInput - The input type for the generateVoiceOverAudio function.
 * - GenerateVoiceOverAudioOutput - The return type for the generateVoiceOverAudio function.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';
import { exec } from 'child_process'; // For executing the command-line tool
import { promises as fs } from 'fs'; // For file system operations (reading/deleting temp file)
import path from 'path'; // For handling file paths
import os from 'os'; // For finding temporary directory
import util from 'util'; // For promisifying exec

// Promisify exec for async/await usage
const execAsync = util.promisify(exec);

// --- Constants ---
const DEFAULT_VOICE_ID = 'en-US-AriaNeural'; // Default Edge TTS voice

// --- Helper Functions ---

/**
 * Helper function to escape shell arguments safely.
 * Wraps the argument in single quotes and escapes any single quotes within it.
 * @param arg The argument string to escape.
 * @returns The escaped string suitable for shell commands.
 */
function escapeShellArg(arg: string): string {
    // More robust escaping for POSIX shells (Linux/macOS)
    // Replaces all single quotes with '\'' (quote, backslash, quote, quote)
    // and wraps the entire string in single quotes.
    return `'${arg.replace(/'/g, "'\\''")}'`;
}


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
 * Checks if the 'edge-tts' command is available in the environment PATH.
 * @returns A promise resolving to true if available, false otherwise.
 */
async function checkEdgeTTSAvailability(): Promise<boolean> {
    try {
        // Use `edge-tts voice-list` as a relatively lightweight check
        // The command should exist if the global package is installed and in PATH.
        console.log("Checking edge-tts availability by running 'edge-tts voice-list'...");
        // Increased timeout for potentially slower systems or first run
        const { stdout, stderr } = await execAsync('edge-tts voice-list', { timeout: 30000 });
        if (stderr && !stderr.toLowerCase().includes('file downloaded successfully')) { // Ignore download messages
            console.warn("edge-tts availability check stderr:", stderr);
            // Some warnings might not be critical failures, but log them.
            // Critical errors like 'command not found' would throw an exception caught below.
        }
        if (stdout && stdout.includes('Name:')) { // Check if output contains expected voice list format
             console.log("edge-tts command seems available and lists voices.");
             return true;
        }
        // If stdout is empty or doesn't contain expected output, but didn't throw, it might still be an issue.
        console.warn("edge-tts voice-list command executed but output was unexpected. Assuming unavailable.", {stdout, stderr});
        return false;

    } catch (error: any) {
        console.error("Error checking edge-tts availability:", error.message);
         if (error.code === 'ENOENT' || error.message.includes('command not found')) {
             console.error("The 'edge-tts' command was not found. Ensure '@andresaya/edge-tts' is installed globally (`npm install -g @andresaya/edge-tts`) and the Node.js global bin directory is in the system PATH.");
         } else if (error.stderr) {
             console.error("Error during edge-tts check (stderr):", error.stderr);
         } else if (error.stdout) { // Log stdout too, might contain clues
              console.error("Error during edge-tts check (stdout):", error.stdout);
         }
        return false;
    }
}

/**
 * Lists available voices from the Edge TTS CLI using `edge-tts voice-list`.
 * Returns the raw output string.
 */
export async function getEdgeTTSVoiceList(): Promise<any[]> {
    try {
      const { stdout, stderr } = await execAsync('edge-tts voice-list', {
        env: { ...process.env, LANG: 'en_US.UTF-8' },
        timeout: 30000,
      });
  
      if (stderr && !stderr.toLowerCase().includes('file downloaded successfully')) {
        console.warn("getEdgeTTSVoiceList stderr:", stderr);
      }
  
      return JSON.parse(stdout);
    } catch (err) {
      console.error("Error fetching Edge TTS voice list:", err);
      throw new Error("Could not fetch Edge TTS voice list. Ensure edge-tts is installed and accessible.");
    }
  }
  
// --- Input/Output Schemas ---

const GenerateVoiceOverAudioInputSchema = z.object({
  articleText: z
    .string()
    .min(1, "Article text cannot be empty.")
    .max(100000, "Article text is very long, consider breaking it down further if issues arise.")
    .describe('The formatted article text to generate voice-over audio from.'),
  voiceId: z.string().optional().default(DEFAULT_VOICE_ID).describe('Edge TTS voice ID (e.g., en-US-AriaNeural). Run `edge-tts voice-list` to see available voices.'),
  // Removed Google TTS specific fields (languageCode, voiceName, bitrate)
});
export type GenerateVoiceOverAudioInput = z.infer<typeof GenerateVoiceOverAudioInputSchema>;

const GenerateVoiceOverAudioOutputSchema = z.object({
  audioDataUri: z.string().describe('The generated voice-over audio as a base64 data URI (e.g., data:audio/mpeg;base64,...).'),
});
export type GenerateVoiceOverAudioOutput = z.infer<typeof GenerateVoiceOverAudioOutputSchema>;

// --- Flow Definition ---

export async function generateVoiceOverAudio(
  input: GenerateVoiceOverAudioInput
): Promise<GenerateVoiceOverAudioOutput> {
  // Validate input using Zod before calling the flow
  const validatedInput = GenerateVoiceOverAudioInputSchema.parse(input);

  // Check if edge-tts is available *before* starting the flow
  const isAvailable = await checkEdgeTTSAvailability();
  if (!isAvailable) {
    // Throw a user-friendly error if the check failed
    throw new Error("Local Edge TTS setup issue: Could not run 'edge-tts' command. Please ensure '@andresaya/edge-tts' is installed globally (`npm install -g @andresaya/edge-tts`) and your Node.js global bin directory is included in your system's PATH. Check server logs for details.");
  }

  // If check passed, proceed with the generation flow
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

    console.log(`Starting Edge TTS Flow for text (${input.articleText.length} chars) starting with: "${input.articleText.substring(0, 50)}..." using voice: ${input.voiceId}`);

    const tempFileName = `edge-tts-output-${Date.now()}.mp3`;
    // Ensure temp directory exists (important in some environments like serverless functions)
    const tempDir = os.tmpdir();
    try {
        await fs.mkdir(tempDir, { recursive: true });
    } catch (mkdirError: any) {
        if (mkdirError.code !== 'EEXIST') { // Ignore error if directory already exists
            console.error(`Failed to ensure temporary directory exists: ${tempDir}`, mkdirError);
            // Decide if this is fatal. For now, we'll let it proceed, hoping the dir exists.
            // throw new Error(`Failed to create temporary directory: ${mkdirError.message}`);
        }
    }
    const tempFilePath = path.join(tempDir, tempFileName);


    console.log(`Generating temporary audio file at: ${tempFilePath}`);

    // Construct the command using the globally installed 'edge-tts'
    // Ensure text is properly escaped for the shell
    const escapedText = escapeShellArg(input.articleText);
    const escapedFilePath = escapeShellArg(tempFilePath); // Escape file path too
    // Command format for @andresaya/edge-tts: edge-tts -v <voice> -f <file> --text <text>
    const command = `edge-tts -v ${input.voiceId} -f ${escapedFilePath} --text ${escapedText}`;

    console.log(`Executing command: edge-tts -v ${input.voiceId} -f '${tempFilePath}' --text '...'`); // Log sanitized command


    try {
        // --- Step 1: Execute edge-tts command ---
        const { stdout, stderr } = await execAsync(command, { timeout: 180000 }); // 3 minute timeout, adjust as needed

        if (stderr) {
            // Check if it's a real error
             console.warn("Edge TTS stderr:", stderr);
             // Ignore common non-error messages like download success
             if (!stderr.toLowerCase().includes('file downloaded successfully')) {
                 // Throw if stderr clearly indicates an error
                 if (stderr.toLowerCase().includes('error') || stderr.toLowerCase().includes('traceback') || stderr.includes('command not found') || stderr.includes('enoent')) {
                     let errMsg = `Edge TTS command execution error: ${stderr}`;
                     if (stderr.includes('command not found') || stderr.includes('enoent')) {
                         errMsg = "Edge TTS command failed. Ensure '@andresaya/edge-tts' is installed globally (`npm install -g @andresaya/edge-tts`) in the server environment and Node's global bin directory is in the server's PATH.";
                     }
                    throw new Error(errMsg);
                 }
             }
        }
        console.log("Edge TTS stdout:", stdout); // May contain progress or success info
        console.log(`Edge TTS command completed successfully.`);


        // --- Step 2: Read the generated audio file ---
         let audioBuffer: Buffer;
        try {
             audioBuffer = await fs.readFile(tempFilePath);
             console.log(`Read temporary audio file (${audioBuffer.length} bytes).`);
        } catch (readError: any) {
             console.error(`Failed to read temporary audio file "${tempFilePath}":`, readError);
             // Attempt to clean up the potentially corrupted temp file
             try {
                 await fs.unlink(tempFilePath);
             } catch (unlinkErr) {
                  console.warn(`Failed to delete temp file after read error: ${tempFilePath}`, unlinkErr);
             }
             throw new Error(`Failed to read the generated audio file. Error: ${readError.message}`);
        }


        if (audioBuffer.length === 0) {
            console.error('Generated audio file is empty.');
            // Check if the file exists but is empty, might indicate an issue during generation
            try {
                await fs.unlink(tempFilePath); // Clean up empty file
            } catch (unlinkError) {
                 console.warn(`Failed to delete empty temporary audio file "${tempFilePath}":`, unlinkError);
            }
            throw new Error('Generated audio file was empty. Edge TTS might have failed silently.');
        }

        // --- Step 3: Convert to Data URI ---
        const audioDataUri = bufferToDataURI(audioBuffer, 'audio/mpeg'); // edge-tts default is mp3
        console.log("Successfully converted audio buffer to Data URI.");

        // --- Step 4: Clean up the temporary file ---
        try {
             await fs.unlink(tempFilePath);
             console.log(`Cleaned up temporary file: ${tempFilePath}`);
        } catch (cleanupError) {
            // Log a warning but don't fail the whole process if cleanup fails
            console.warn(`Failed to clean up temporary audio file "${tempFilePath}":`, cleanupError);
        }

        return { audioDataUri };

    } catch (error: any) {
        console.error('Error caught in generateVoiceOverAudioFlow (Local Edge TTS - Node Package):', error);

         // Attempt to clean up the temp file even if generation failed
         try {
            // Check if file exists before trying to unlink
            if (await fs.stat(tempFilePath).then(() => true).catch(() => false)) {
                 await fs.unlink(tempFilePath);
                 console.log(`Cleaned up temporary file after error: ${tempFilePath}`);
            }
         } catch (cleanupError) {
            console.warn(`Failed to clean up temporary file "${tempFilePath}" after error:`, cleanupError);
         }


        let errorMessage = 'Failed to generate voice over audio using local Edge TTS.';
        // Check for specific errors related to command execution
        if (error.code === 'ENOENT' || (error.message && (error.message.includes('command not found') || error.message.includes('No such file or directory'))) ) {
             // This usually means 'edge-tts' command itself failed
              errorMessage = "Edge TTS command failed: 'edge-tts' command not found or inaccessible in the server environment. Ensure '@andresaya/edge-tts' is installed globally (`npm install -g @andresaya/edge-tts`) on the server and Node's global bin directory is included in the server's system PATH environment variable.";
        } else if (error.stderr) {
             // Include stderr if it likely contains the error reason
             errorMessage += ` Stderr: ${error.stderr}`;
        } else if (error.stdout) {
             // Include stdout if it might contain useful error info (less likely for errors)
             errorMessage += ` Stdout: ${error.stdout}`;
        } else if (error instanceof Error) {
            // General error message
            errorMessage += ` Details: ${error.message}`;
        } else {
             errorMessage += ` An unexpected error occurred: ${JSON.stringify(error)}`;
        }

        console.error("Final Error Message to Throw:", errorMessage);
        throw new Error(errorMessage);
    }
});
