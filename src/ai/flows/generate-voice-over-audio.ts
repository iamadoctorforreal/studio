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
// Default voice - see `edge-tts --list-voices` for options
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
  voiceId: z.string().optional().default(DEFAULT_VOICE).describe('Edge TTS Voice ID (e.g., en-US-AvaNeural, en-GB-SoniaNeural). See `edge-tts --list-voices`.'),
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


export async function generateVoiceOverAudio(
  input: GenerateVoiceOverAudioInput
): Promise<GenerateVoiceOverAudioOutput> {
  // Validate input using Zod before calling the flow
  const validatedInput = GenerateVoiceOverAudioInputSchema.parse(input);

  // Optional: Add a check here to see if the `python -m edge_tts --version` command exists?
  // This could involve running `python -m edge_tts --version` or similar.
  // try {
  //   await execAsync('python -m edge_tts --version');
  // } catch (error: any) {
  //    console.error("`python -m edge_tts` command failed:", error);
  //    let errMsg = "Local Edge TTS Python module is not available or not working. Please ensure Python is installed and in the PATH, and run `pip install edge-tts`.";
  //    if (error.message.includes('command not found') || error.code === 'ENOENT') {
  //        errMsg = "Python command not found. Please ensure Python is installed and its directory is included in the system's PATH environment variable.";
  //    }
  //    throw new Error(errMsg);
  // }

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

    const tempFilePath = path.join(os.tmpdir(), `edge-tts-output-${Date.now()}.mp3`);
    console.log(`Generating temporary audio file at: ${tempFilePath}`);

    // Construct the command using 'python -m edge_tts'
    // Ensure text is properly escaped for the shell
    const escapedText = escapeShellArg(input.articleText);
    const command = `python -m edge_tts --voice ${input.voiceId} --text ${escapedText} --write-media ${escapeShellArg(tempFilePath)}`;

    console.log(`Executing command: python -m edge_tts --voice ${input.voiceId} --text '...' --write-media '${tempFilePath}'`); // Log sanitized command


    try {
        // --- Step 1: Execute edge-tts command via Python module ---
        const { stdout, stderr } = await execAsync(command, { timeout: 180000 }); // 3 minute timeout, adjust as needed

        if (stderr) {
            // edge-tts might print progress or info to stderr, check if it's a real error
             console.warn("Edge TTS stderr:", stderr);
             // Only throw if stderr clearly indicates a Python or edge-tts module error
             if (stderr.toLowerCase().includes('error:') || stderr.toLowerCase().includes('traceback')) {
                throw new Error(`Edge TTS Python module reported an error: ${stderr}`);
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
            throw new Error('Generated audio file is empty.');
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
            if (await fs.stat(tempFilePath).catch(() => false)) {
                 await fs.unlink(tempFilePath);
                 console.log(`Cleaned up temporary file after error: ${tempFilePath}`);
            }
         } catch (cleanupError) {
            console.warn(`Failed to clean up temporary file "${tempFilePath}" after error:`, cleanupError);
         }


        let errorMessage = 'Failed to generate voice over audio using local Edge TTS.';
        // Check for specific errors related to command execution
        if (error.code === 'ENOENT' || (error.stderr && error.stderr.includes('command not found'))) {
             if (error.cmd?.startsWith('python')) {
                 errorMessage = 'Edge TTS command failed: `python` not found or `edge-tts` module error. Please ensure Python is installed, in the PATH, and run `pip install edge-tts`. Check Python environment.';
             } else {
                 errorMessage = 'Edge TTS command failed: Check if `edge-tts` is installed correctly (`pip install edge-tts`) and accessible via `python -m edge_tts`.';
             }
        } else if (error.stderr) {
             // Include stderr if it likely contains the error reason
             errorMessage += ` Stderr: ${error.stderr}`;
        } else if (error.stdout) {
             // Include stdout if it might contain useful error info
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
