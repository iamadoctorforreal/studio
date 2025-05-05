
'use server';

/**
 * @fileOverview A voice-over audio generation AI agent using a local Edge TTS installation.
 *
 * - generateVoiceOverAudio - A function that generates voice-over audio from the formatted article.
 * - GenerateVoiceOverAudioInput - The input type for the generateVoiceOverAudio function.
 * - GenerateVoiceOverAudioOutput - The return type for the generateVoiceOverAudio function.
 *
 * NOTE: This flow relies on having Python and the `edge-tts` Python package installed
 * in the environment where the Next.js server is running.
 * You can install it via pip: `pip install edge-tts`
 * It executes the `edge-tts` Python module.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';
import { exec } from 'child_process'; // For executing the command-line tool
import { promises as fs } from 'fs'; // For file system operations (reading/deleting temp file)
import path from 'path'; // For handling file paths
import os from 'os'; // For finding temporary directory
import { promisify } from 'util'; // To promisify exec

const execAsync = promisify(exec);

// --- Constants ---
// Default voice - see `python -m edge_tts --list-voices` for options
const DEFAULT_VOICE = 'en-US-SierraNeural';
// You might want to expose more options via the input schema later

const GenerateVoiceOverAudioInputSchema = z.object({
  articleText: z
    .string()
    .min(1, "Article text cannot be empty.")
    // Edge TTS might have its own limits, but they are less defined than API limits.
    // Keeping a reasonable limit for practical purposes.
    .max(100000, "Article text is very long, generation might take time or fail.")
    .describe('The formatted article text to generate voice-over audio from.'),
  voiceId: z.string().optional().default(DEFAULT_VOICE).describe('Edge TTS Voice ID (e.g., en-US-AvaNeural, en-GB-SoniaNeural). See `python -m edge_tts --list-voices`.'),
  // Add other potential edge-tts options here if needed (rate, pitch, volume)
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
    // Ensure Buffer is available (should be in Node.js environment)
    if (typeof Buffer === 'undefined') {
        throw new Error("Buffer API is not available in this environment.");
    }
    const base64String = Buffer.isBuffer(buffer) ? buffer.toString('base64') : Buffer.from(buffer).toString('base64');
    return `data:${mimeType};base64,${base64String}`;
}

/**
 * Helper function to safely escape text for shell commands.
 * Wraps the text in single quotes and escapes any internal single quotes.
 * Adjust based on your shell environment if necessary (e.g., Windows might need different escaping).
 * @param text The text to escape.
 * @returns Escaped text suitable for embedding in a shell command.
 */
function escapeShellArg(text: string): string {
    // Simple escaping for POSIX-like shells (Linux, macOS)
    // Replaces single quotes with '\'', then wraps the whole string in single quotes.
    return `'${text.replace(/'/g, "'\\''")}'`;
    // For Windows (cmd.exe), escaping is more complex. You might need a different strategy
    // or use libraries designed for cross-platform shell escaping if Windows support is critical.
}

// Flag to track if the initial check has been performed
let edgeTtsCheckPerformed = false;
let edgeTtsAvailable = false;

/**
 * Checks if the `python -m edge_tts --version` command runs successfully.
 * Caches the result to avoid repeated checks.
 */
async function checkEdgeTtsAvailability(): Promise<boolean> {
    if (edgeTtsCheckPerformed) {
        return edgeTtsAvailable;
    }

    console.log("Performing initial check for Edge TTS availability...");
    try {
        // Use a short timeout for the version check
        const { stdout, stderr } = await execAsync('python -m edge_tts --version', { timeout: 5000 });
        console.log("Edge TTS version check stdout:", stdout);
        if (stderr) {
            console.warn("Edge TTS version check stderr:", stderr);
            // Some versions might print info to stderr, allow if it doesn't look like an error
            if (stderr.toLowerCase().includes('error') || stderr.toLowerCase().includes('traceback')) {
                 throw new Error(`Edge TTS version check failed: ${stderr}`);
            }
        }
        console.log("Edge TTS seems available.");
        edgeTtsAvailable = true;
    } catch (error: any) {
        console.error("Edge TTS availability check failed:", error);
        edgeTtsAvailable = false;
         // Provide specific guidance based on common errors
         if (error.message.includes('command not found') || error.code === 'ENOENT') {
             console.error("Error Suggestion: 'python' command not found. Ensure Python is installed and added to the system's PATH.");
         } else if (error.message.includes('No module named edge_tts')) {
              console.error("Error Suggestion: 'edge-tts' Python module not found. Install it using 'pip install edge-tts'.");
         } else {
              console.error("Error Suggestion: Unexpected error during Edge TTS check. Verify Python and pip installation.");
         }
    }
    edgeTtsCheckPerformed = true;
    return edgeTtsAvailable;
}


export async function generateVoiceOverAudio(
  input: GenerateVoiceOverAudioInput
): Promise<GenerateVoiceOverAudioOutput> {
  // Validate input using Zod before calling the flow
  const validatedInput = GenerateVoiceOverAudioInputSchema.parse(input);

  // Perform the availability check
  const isAvailable = await checkEdgeTtsAvailability();
  if (!isAvailable) {
    // Throw a user-friendly error if the check failed
    throw new Error("Local Edge TTS setup issue: Could not run 'python -m edge_tts'. Please ensure Python is installed, added to your PATH, and the 'edge-tts' package is installed (`pip install edge-tts`). Check server logs for details.");
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
async (input: GenerateVoiceOverAudioInput): Promise<GenerateVoiceOverAudioOutput> => {
    if (!input.articleText || input.articleText.trim().length === 0) {
        throw new Error('Article text cannot be empty.');
    }

    console.log(`Starting Edge TTS Flow for text (${input.articleText.length} chars) starting with: "${input.articleText.substring(0, 50)}..." using voice: ${input.voiceId}`);

    const tempFileName = `edge-tts-output-${Date.now()}.mp3`;
    // Ensure temp directory exists (important in some environments like serverless functions)
    const tempDir = os.tmpdir();
    try {
        await fs.mkdir(tempDir, { recursive: true });
    } catch (mkdirError) {
        console.warn(`Could not ensure temp directory ${tempDir} exists:`, mkdirError);
        // Proceed anyway, hoping it exists
    }
    const tempFilePath = path.join(tempDir, tempFileName);


    console.log(`Generating temporary audio file at: ${tempFilePath}`);

    // Construct the command using 'python -m edge_tts'
    // Ensure text is properly escaped for the shell
    const escapedText = escapeShellArg(input.articleText);
    const escapedFilePath = escapeShellArg(tempFilePath); // Escape file path too
    const command = `python -m edge_tts --voice ${input.voiceId} --text ${escapedText} --write-media ${escapedFilePath}`;

    console.log(`Executing command: python -m edge_tts --voice ${input.voiceId} --text '...' --write-media '${tempFilePath}'`); // Log sanitized command


    try {
        // --- Step 1: Execute edge-tts command via Python module ---
        const { stdout, stderr } = await execAsync(command, { timeout: 180000 }); // 3 minute timeout, adjust as needed

        if (stderr) {
            // edge-tts might print progress or info to stderr, check if it's a real error
             console.warn("Edge TTS stderr:", stderr);
             // Only throw if stderr clearly indicates a Python or edge-tts module error
             if (stderr.toLowerCase().includes('error:') || stderr.toLowerCase().includes('traceback') || stderr.includes('command not found') || stderr.includes('No module named')) {
                 // Throw a more specific error based on stderr content
                 let errMsg = `Edge TTS Python module error: ${stderr}`;
                 if (stderr.includes('command not found') || stderr.includes('No module named edge_tts')) {
                     errMsg = "Edge TTS command failed. Ensure 'python' is in PATH and 'edge-tts' is installed (`pip install edge-tts`).";
                 }
                throw new Error(errMsg);
             }
        }
        console.log("Edge TTS stdout:", stdout); // Usually empty unless there's info output
        console.log(`Edge TTS command completed successfully.`);


        // --- Step 2: Read the generated audio file ---
         let audioBuffer: Buffer;
        try {
             audioBuffer = await fs.readFile(tempFilePath);
             console.log(`Read temporary audio file (${audioBuffer.length} bytes).`);
        } catch (readError: any) {
             console.error(`Failed to read temporary audio file "${tempFilePath}":`, readError);
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

         // --- Step 4: Clean up temporary file ---
        try {
            await fs.unlink(tempFilePath);
            console.log(`Deleted temporary audio file: ${tempFilePath}`);
        } catch (unlinkError: any) {
            // Log an error but don't fail the whole process if cleanup fails
            console.warn(`Failed to delete temporary audio file "${tempFilePath}":`, unlinkError);
        }

        return { audioDataUri };

    } catch (error: any) {
        console.error('Error caught in generateVoiceOverAudioFlow (Local Edge TTS):', error);

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
             // This usually means 'python' command itself failed
              errorMessage = "Edge TTS command failed: 'python' command not found or inaccessible. Ensure Python is installed and its directory is included in the system's PATH environment variable.";
        } else if (error.message && error.message.includes('No module named edge_tts')) {
             errorMessage = "Edge TTS command failed: The 'edge-tts' Python module was not found. Please install it using 'pip install edge-tts' in your Python environment.";
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
             errorMessage += ' An unexpected error occurred.';
        }

        console.error("Final Error Message to Throw:", errorMessage);
        throw new Error(errorMessage);
    }
});

    