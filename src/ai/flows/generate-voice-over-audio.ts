
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
import { exec, spawn } from 'child_process'; // For executing the command-line tool
import { promises as fs } from 'fs'; // For file system operations (reading/deleting temp file)
import path from 'path'; // For handling file paths
import os from 'os'; // For finding temporary directory
import util from 'util'; // For promisifying exec

// Promisify exec for async/await usage
const execAsync = util.promisify(exec);

// --- Constants ---
const DEFAULT_VOICE_ID = 'en-US-AriaNeural'; // Default Edge TTS voice
const localEdgeTtsCommand = os.platform() === 'win32' 
    ? path.join(process.cwd(), 'node_modules', '.bin', 'edge-tts.cmd')
    : path.join(process.cwd(), 'node_modules', '.bin', 'edge-tts');

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
async function checkCommandAvailability(command: string): Promise<boolean> {
    try {
        // Use a simple command like --version or help if available, otherwise try to exec.
        // For generic check, just see if exec itself fails with ENOENT.
        // On Windows, `where` command can check PATH, on Linux `command -v`
        const checkCmd = os.platform() === 'win32' ? `where ${command.split(' ')[0]}` : `command -v ${command.split(' ')[0]}`;
        await execAsync(checkCmd);
        console.log(`Command '${command.split(' ')[0]}' seems available.`);
        return true;
    } catch (error) {
        console.warn(`Command '${command.split(' ')[0]}' not found or not executable:`, (error as Error).message);
        return false;
    }
}

async function checkEdgeTTSAvailability(): Promise<boolean> {
    console.log("Checking edge-tts availability...");
    let cmdToTest = `"${localEdgeTtsCommand}" --version`; // Using --version as a lightweight check
    try {
        await fs.access(localEdgeTtsCommand, fs.constants.X_OK);
        console.log(`Local edge-tts command accessible: ${localEdgeTtsCommand}`);
    } catch (localError: any) {
        console.warn(`Local edge-tts command at '${localEdgeTtsCommand}' not accessible (${localError.message}). Falling back to 'edge-tts' in PATH.`);
        cmdToTest = "edge-tts --version"; // Fallback
    }

    try {
        const { stdout } = await execAsync(cmdToTest, { timeout: 10000 });
        if (stdout && stdout.trim().length > 0) { // Check if it produced any output
            console.log(`edge-tts (using ${cmdToTest.startsWith('"') ? 'local' : 'PATH'}) is available. Version/Output: ${stdout.trim()}`);
            return true;
        }
        console.warn(`edge-tts check ('${cmdToTest}') produced no stdout. Assuming unavailable.`);
        return false;
    } catch (error: any) {
        console.error(`Error executing edge-tts check ('${cmdToTest}'):`, error.message);
        return false;
    }
}

// Helper function to split text into chunks
function chunkText(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let currentChunk = "";
    // Split by sentences to prefer natural breaks, then further by words if sentences are too long.
    // This is a simplified sentence splitter. A more robust one would handle more edge cases.
    const sentences = text.match(/[^.!?]+[.!?]+(?:[\s\n]+|$)/g) || [text]; // Split by sentences, include newline

    for (const sentence of sentences) {
        if (sentence.length > maxLength) {
            // If a single sentence is too long, split it by words
            const words = sentence.split(/\s+/);
            let tempChunkForLongSentence = "";
            for (const word of words) {
                if ((tempChunkForLongSentence + word + " ").length > maxLength) {
                    if (tempChunkForLongSentence) chunks.push(tempChunkForLongSentence.trim());
                    tempChunkForLongSentence = word + " ";
                } else {
                    tempChunkForLongSentence += word + " ";
                }
            }
            if (tempChunkForLongSentence) chunks.push(tempChunkForLongSentence.trim());
        } else {
            // Add sentence to current chunk if it fits
            if ((currentChunk + sentence).length > maxLength) {
                if (currentChunk) chunks.push(currentChunk.trim());
                currentChunk = sentence;
            } else {
                currentChunk += sentence;
            }
        }
    }
    if (currentChunk) chunks.push(currentChunk.trim());
    return chunks.filter(chunk => chunk.length > 0 && chunk.trim() !== '');
}

function sanitizeTextForTTS(text: string): string {
    let sanitized = text;

    // Remove markdown bold/italic (asterisks and underscores)
    sanitized = sanitized.replace(/\*\*(.*?)\*\*/g, '$1'); // **bold**
    sanitized = sanitized.replace(/__(.*?)__/g, '$1'); // __bold__
    // For single asterisks/underscores, be careful not to remove legitimate uses if any.
    // This regex is greedy for single * or _ if they surround text.
    sanitized = sanitized.replace(/(?<!\*)\*(?!\s|\*)([^*]+?)\*(?!\*)/g, '$1'); // *italic* but not ** or * list
    sanitized = sanitized.replace(/(?<!_)\_(?!\s|_)([^_]+?)\_(?!_)/g, '$1');   // _italic_ but not __ or _ list

    // Remove markdown headings (e.g., #, ##, ###)
    sanitized = sanitized.replace(/^#{1,6}\s+/gm, '');

    // Remove markdown list markers (*, -, +) followed by a space, if at start of line
    sanitized = sanitized.replace(/^[\*\-\+]\s+/gm, '');

    // Remove markdown links, keeping the link text: [text](url) -> text
    sanitized = sanitized.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

    // Remove markdown images, keeping alt text or removing: ![alt](url) -> alt or ""
    sanitized = sanitized.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1'); // Keeps alt text

    // Remove horizontal rules (---, ***, ___). Replace with a space to avoid words running together.
    sanitized = sanitized.replace(/^\s*[-\*_]{3,}\s*$/gm, ' '); // Handles full lines, replaces with space
    sanitized = sanitized.replace(/---/g, ' '); // Handles inline ---, replaces with a space
    
    // Remove HTML tags
    sanitized = sanitized.replace(/<\/?[^>]+(>|$)/g, "");

    // Remove markdown code blocks (```...```) and inline code (`...`)
    sanitized = sanitized.replace(/```[\s\S]*?```/g, ''); // Multiline code blocks
    sanitized = sanitized.replace(/`([^`]+?)`/g, '$1');    // Inline code

    // Normalize multiple newlines to a single newline (or two for paragraphs if preferred)
    // Let's aim for single newlines between paragraphs for TTS, as TTS usually handles paragraph breaks by pause.
    sanitized = sanitized.replace(/\n{2,}/g, '\n'); // Collapse multiple newlines to one

    // Trim whitespace from each line and remove empty lines that might result
    // sanitized = sanitized.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n');
    // The above can be too aggressive if some intentional single newlines are for flow.
    // Instead, let's just normalize spaces and trim overall.

    // Normalize excessive whitespace within lines to a single space
    sanitized = sanitized.replace(/[ \t]{2,}/g, ' ');
    
    // Remove leading/trailing whitespace from each line
    sanitized = sanitized.split('\n').map(line => line.trim()).join('\n');
    
    // Remove any remaining purely empty lines that might have formed
    sanitized = sanitized.replace(/^\s*[\r\n]/gm, '');


    return sanitized.trim();
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

    const originalTextLength = input.articleText.length;
    const textToSynthesize = sanitizeTextForTTS(input.articleText);
    const sanitizedTextLength = textToSynthesize.length;

    if (textToSynthesize.trim().length === 0) {
        throw new Error('After sanitization, the article text is empty.');
    }

    console.log(`Starting Edge TTS Flow. Original text length: ${originalTextLength}, Sanitized text length: ${sanitizedTextLength}. Voice: ${input.voiceId}`);
    console.log(`Sanitized text starts with: "${textToSynthesize.substring(0, 100)}..."`);

    // tempFilePathWithoutExt and related single-file logic is not directly used by chunking path for final audio.
    // However, the main catch block might still reference it for cleanup if an error occurs very early.
    // For chunking, a dedicated temp directory is used.
    const originalTempFileName = `edge-tts-output-fallback-${Date.now()}.mp3`;
    const originalTempFilePath = path.join(os.tmpdir(), originalTempFileName);
    const originalTempFilePathWithoutExt = originalTempFilePath.replace(/\.mp3$/, '');

    let tempDirForChunks: string | undefined; // To store path for cleanup

    // Determine the edge-tts command to use (local or PATH)
    let edgeTtsCommandForExec = `"edge-tts"`; // Default to PATH, quoted for exec
    try {
        await fs.access(localEdgeTtsCommand, fs.constants.X_OK);
        edgeTtsCommandForExec = `"${localEdgeTtsCommand}"`; // Use local if available
        console.log(`Using local edge-tts for synthesis exec: ${edgeTtsCommandForExec}`);
    } catch {
        console.log(`Local edge-tts not found/accessible for synthesis, using 'edge-tts' from PATH for exec.`);
    }

    // Check ffmpeg availability
    const ffmpegAvailable = await checkCommandAvailability('ffmpeg');
    if (!ffmpegAvailable) {
        throw new Error("ffmpeg is not installed or not found in PATH. It is required for concatenating audio chunks.");
    }

    const MAX_CHUNK_LENGTH = 1500; // Reduced max characters per chunk
    const chunks = chunkText(textToSynthesize, MAX_CHUNK_LENGTH); // Use sanitized text for chunking
    const chunkFilePaths: string[] = [];
    // Assign to the already declared tempDirForChunks
    tempDirForChunks = await fs.mkdtemp(path.join(os.tmpdir(), 'edge-tts-chunks-')); 

    console.log(`Splitting text into ${chunks.length} chunks.`);

    try {
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            // Escape chunk text for command line (simple " replace for now)
            const escapedChunkText = `"${chunk.replace(/"/g, '\\"')}"`; 
            // Output filename for edge-tts should NOT have .mp3, as the tool adds it.
            const tempChunkBaseFileName = path.join(tempDirForChunks, `chunk_${i}`);
            // This is the filename that edge-tts will actually create
            const expectedChunkOutputFileName = `${tempChunkBaseFileName}.mp3`; 
            
            const command = `${edgeTtsCommandForExec} synthesize --voice ${input.voiceId} --output "${tempChunkBaseFileName}" --text ${escapedChunkText}`;
            console.log(`Synthesizing chunk ${i + 1}/${chunks.length}: ${command.substring(0, 200)}...`);
            
            try {
                const { stdout: chunkStdout, stderr: chunkStderr } = await execAsync(command, { timeout: 60000 }); // 1 min timeout per chunk
                if (chunkStderr && !chunkStderr.toLowerCase().includes('file downloaded successfully')) {
                    console.warn(`Chunk ${i+1} synthesis stderr: ${chunkStderr}`);
                }
                if (chunkStdout) {
                     console.log(`Chunk ${i+1} synthesis stdout: ${chunkStdout}`);
                }
                // Add the actual filename (with .mp3 added by edge-tts) to the list for ffmpeg
                chunkFilePaths.push(expectedChunkOutputFileName);
            } catch (chunkError: any) {
                console.error(`Error synthesizing chunk ${i + 1}:`, chunkError.message);
                console.error(`Command was: ${command}`);
                if (chunkError.stderr) console.error("Chunk Error Stderr:", chunkError.stderr);
                if (chunkError.stdout) console.error("Chunk Error Stdout:", chunkError.stdout);
                throw new Error(`Failed to synthesize audio chunk ${i + 1}: ${chunkError.message}`);
            }
        }

        if (chunkFilePaths.length === 0) {
            throw new Error("No audio chunks were generated.");
        }

        // Concatenate audio chunks using ffmpeg
        const finalListPath = path.join(tempDirForChunks, 'ffmpeg_list.txt');
        // ffmpeg concat demuxer requires forward slashes, even on Windows.
        const fileListContent = chunkFilePaths.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
        await fs.writeFile(finalListPath, fileListContent);

        const finalConcatenatedPath = path.join(tempDirForChunks, `final_audio_concat.mp3`);
        // Modified ffmpeg command to re-encode, strip metadata, and ignore DTS issues
        // Using parameters observed from edge-tts output: 24000 Hz, mono, 48 kbps
        const ffmpegCommand = `ffmpeg -y -f concat -safe 0 -i "${finalListPath}" -map_metadata -1 -fflags +igndts -ar 24000 -ac 1 -b:a 48k "${finalConcatenatedPath}"`;
        
        console.log(`Concatenating and re-encoding ${chunkFilePaths.length} audio chunks with ffmpeg (stripping metadata, ignoring DTS issues)...`);
        console.log(`ffmpeg command: ${ffmpegCommand}`);
        
        const { stdout: ffmpegStdout, stderr: ffmpegStderr } = await execAsync(ffmpegCommand, { timeout: 180000 }); // 3 min for concat
        if (ffmpegStderr) console.warn("ffmpeg stderr:", ffmpegStderr); // ffmpeg often outputs info to stderr
        if (ffmpegStdout) console.log("ffmpeg stdout:", ffmpegStdout);
        
        console.log("Audio concatenation complete.");

        // Read the final concatenated audio file
        let audioBuffer: Buffer;
        try {
            audioBuffer = await fs.readFile(finalConcatenatedPath);
            console.log(`Read final concatenated audio file (${audioBuffer.length} bytes) from ${finalConcatenatedPath}.`);
        } catch (readError: any) {
            console.error(`Failed to read final concatenated audio file "${finalConcatenatedPath}":`, readError);
            throw new Error(`Failed to read the final concatenated audio file. Error: ${readError.message}`);
        }

        if (audioBuffer.length === 0) {
            console.error('Generated audio file is empty.');
            throw new Error('Generated audio file (after concatenation) was empty.');
        }

        // --- Step 3: Convert to Data URI ---
        const audioDataUri = bufferToDataURI(audioBuffer, 'audio/mpeg');
        console.log("Successfully converted audio buffer to Data URI.");

        // --- Step 4: Clean up the temporary chunk directory ---
        // Temporarily disabling cleanup for debugging individual chunk files
        console.log(`Skipping cleanup of temporary chunk directory for debugging: ${tempDirForChunks}`);
        // try {
        //     if (tempDirForChunks) { 
        //         await fs.rm(tempDirForChunks, { recursive: true, force: true });
        //         console.log(`Cleaned up temporary chunk directory: ${tempDirForChunks}`);
        //     }
        // } catch (cleanupError) {
        //     console.warn(`Failed to clean up temporary chunk directory "${tempDirForChunks}":`, cleanupError);
        // }

        return { audioDataUri };

    } catch (error: any) {
        console.error('Error caught in generateVoiceOverAudioFlow:', error);

        // Attempt to clean up the chunk directory if it was created - also temporarily disabled for debugging
        console.log(`Skipping cleanup of temporary chunk directory after error for debugging: ${tempDirForChunks}`);
        // if (tempDirForChunks) {
        //     try {
        //         await fs.rm(tempDirForChunks, { recursive: true, force: true });
        //         console.log(`Cleaned up temporary chunk directory after error: ${tempDirForChunks}`);
        //     } catch (cleanupError) {
        //         console.warn(`Failed to clean up temporary chunk directory "${tempDirForChunks}" after error:`, cleanupError);
        //     }
        // }
        // Also attempt to clean up the original single temp file path if it was involved in an early error
        // This path (originalTempFilePathWithoutExt) is less likely to exist if chunking started, but good for robustness.
        const fileToCleanEarly = `${originalTempFilePathWithoutExt}.mp3`;
         try {
            if (await fs.stat(fileToCleanEarly).then(() => true).catch(() => false)) {
                 await fs.unlink(fileToCleanEarly);
                 console.log(`Cleaned up original temp file after error: ${fileToCleanEarly}`);
            }
         } catch (cleanupError) {
            // console.warn(`Failed to clean up original temp file "${fileToCleanEarly}" after error:`, cleanupError);
         }

        const specificErrorMessage = error instanceof Error ? error.message : JSON.stringify(error);
        const finalMessage = `Failed to generate voice over audio: ${specificErrorMessage}`;
        console.error("Final Error Message to Throw:", finalMessage);
        throw new Error(finalMessage);
    }
});
