'use server';

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';
import { exec } from 'child_process';
import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import util from 'util';

const execAsync = util.promisify(exec);
let ttsClientInstance: TextToSpeechClient | null = null;

function getTtsClient(): TextToSpeechClient {
    if (!ttsClientInstance) {
        ttsClientInstance = new TextToSpeechClient();
    }
    return ttsClientInstance;
}

// --- Constants ---
const DEFAULT_GOOGLE_VOICE_NAME = 'en-US-Standard-C'; // A standard, widely available voice
const DEFAULT_GOOGLE_LANGUAGE_CODE = 'en-US';
const MAX_GOOGLE_TTS_CHUNK_LENGTH = 4800; // Google TTS limit is 5000 bytes, ~4800 chars is safer

// --- Helper Functions ---

function bufferToDataURI(buffer: Buffer | Uint8Array, mimeType: string): string {
    const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    return `data:${mimeType};base64,${data.toString('base64')}`;
}

async function checkFfmpegAvailability(): Promise<boolean> {
    try {
        const cmd = os.platform() === 'win32' ? 'where ffmpeg' : 'command -v ffmpeg';
        await execAsync(cmd);
        console.log(`Command 'ffmpeg' seems available.`);
        return true;
    } catch (error) {
        console.warn(`Command 'ffmpeg' not found or not executable:`, (error as Error).message);
        return false;
    }
}

function chunkText(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let currentChunk = "";
    const sentences = text.match(/[^.!?]+[.!?]+(?:[\s\n]+|$)/g) || [text];

    for (const sentence of sentences) {
        if (sentence.length > maxLength) {
            const words = sentence.split(/\s+/);
            let tempWordChunk = "";
            for (const word of words) {
                if ((tempWordChunk + word + " ").length > maxLength) {
                    if (tempWordChunk) chunks.push(tempWordChunk.trim());
                    tempWordChunk = word + " ";
                } else {
                    tempWordChunk += word + " ";
                }
            }
            if (tempWordChunk) chunks.push(tempWordChunk.trim());
        } else {
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
    sanitized = sanitized.replace(/\*\*(.*?)\*\*/g, '$1'); 
    sanitized = sanitized.replace(/__(.*?)__/g, '$1'); 
    sanitized = sanitized.replace(/(?<!\*)\*(?!\s|\*)([^*]+?)\*(?!\*)/g, '$1'); 
    sanitized = sanitized.replace(/(?<!_)\_(?!\s|_)([^_]+?)\_(?!_)/g, '$1');   
    sanitized = sanitized.replace(/^#{1,6}\s+/gm, '');
    sanitized = sanitized.replace(/^[\*\-\+]\s+/gm, '');
    sanitized = sanitized.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
    sanitized = sanitized.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1'); 
    sanitized = sanitized.replace(/^\s*[-\*_]{3,}\s*$/gm, ' '); 
    sanitized = sanitized.replace(/---/g, ' '); 
    sanitized = sanitized.replace(/<\/?[^>]+(>|$)/g, "");
    sanitized = sanitized.replace(/```[\s\S]*?```/g, ''); 
    sanitized = sanitized.replace(/`([^`]+?)`/g, '$1');    
    sanitized = sanitized.replace(/\n{2,}/g, '\n'); 
    sanitized = sanitized.replace(/[ \t]{2,}/g, ' ');
    sanitized = sanitized.split('\n').map(line => line.trim()).join('\n');
    sanitized = sanitized.replace(/^\s*[\r\n]/gm, '');
    return sanitized.trim();
}

export async function getGoogleTTSVoiceList(
    languageCode?: string
): Promise<protos.google.cloud.texttospeech.v1.IVoice[]> {
    try {
        const client = getTtsClient();
        const [response] = await client.listVoices({ languageCode: languageCode || DEFAULT_GOOGLE_LANGUAGE_CODE });
        return response.voices || [];
    } catch (err) {
        console.error("Error fetching Google TTS voice list:", err);
        throw new Error("Could not fetch Google TTS voice list. Ensure API is enabled and authenticated.");
    }
}
  
const GenerateVoiceOverAudioInputSchema = z.object({
  articleText: z.string().min(1, "Article text cannot be empty.")
    .max(100000, "Article text is very long (max 100,000 chars). Consider impact on processing time/cost.")
    .describe('The formatted article text to generate voice-over audio from.'),
  voiceName: z.string().optional().describe('Google TTS voice name (e.g., en-US-Wavenet-D). If not provided, a default will be used.'),
  languageCode: z.string().optional().describe('Google TTS language code (e.g., en-US). If not provided, a default will be used.'),
  // Add other Google TTS parameters as needed, e.g., speakingRate, pitch, ssmlGender
});
export type GenerateVoiceOverAudioInput = z.infer<typeof GenerateVoiceOverAudioInputSchema>;

const GenerateVoiceOverAudioOutputSchema = z.object({
  audioDataUri: z.string().describe('The generated voice-over audio as a base64 data URI.'),
});
export type GenerateVoiceOverAudioOutput = z.infer<typeof GenerateVoiceOverAudioOutputSchema>;

export async function generateVoiceOverAudio(
  input: GenerateVoiceOverAudioInput
): Promise<GenerateVoiceOverAudioOutput> {
  const validatedInput = GenerateVoiceOverAudioInputSchema.parse(input);
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

    console.log(`Starting Google TTS Flow. Original text length: ${originalTextLength}, Sanitized text length: ${sanitizedTextLength}.`);
    console.log(`Voice params: Name='${input.voiceName}', LanguageCode='${input.languageCode}'`);
    
    let tempDirForChunks: string | undefined;

    try {
        const ffmpegAvailable = await checkFfmpegAvailability();
        if (!ffmpegAvailable) {
            throw new Error("ffmpeg is not installed or not found in PATH. It is required for concatenating audio chunks.");
        }

        const chunks = chunkText(textToSynthesize, MAX_GOOGLE_TTS_CHUNK_LENGTH);
        const chunkFilePaths: string[] = [];
        tempDirForChunks = await fs.mkdtemp(path.join(os.tmpdir(), 'gtts-chunks-')); 

        console.log(`Splitting text into ${chunks.length} chunks for Google TTS.`);

        const client = getTtsClient();
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const tempChunkAudioPath = path.join(tempDirForChunks, `chunk_${i}.mp3`);

            console.log(`Synthesizing chunk ${i + 1}/${chunks.length} with Google TTS...`);
            
            const request: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
                input: { text: chunk },
                voice: {
                    languageCode: input.languageCode || DEFAULT_GOOGLE_LANGUAGE_CODE,
                    name: input.voiceName || DEFAULT_GOOGLE_VOICE_NAME, 
                },
                audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000 },
            };

            try {
                const [response] = await client.synthesizeSpeech(request);
                if (!response.audioContent) {
                    throw new Error(`Google TTS returned no audio content for chunk ${i + 1}.`);
                }
                await fs.writeFile(tempChunkAudioPath, response.audioContent, 'binary');
                chunkFilePaths.push(tempChunkAudioPath);
                console.log(`Chunk ${i + 1} synthesized successfully to ${tempChunkAudioPath}`);
            } catch (chunkError: any) {
                console.error(`Error synthesizing chunk ${i + 1} with Google TTS:`, chunkError.message);
                throw new Error(`Failed to synthesize audio chunk ${i + 1} with Google TTS: ${chunkError.message}`);
            }
        }

        if (chunkFilePaths.length === 0) {
            throw new Error("No audio chunks were generated by Google TTS.");
        }
        if (chunkFilePaths.length === 1) {
            // If only one chunk, no need to concatenate
            console.log("Only one chunk generated, no concatenation needed.");
            const audioBuffer = await fs.readFile(chunkFilePaths[0]);
            const audioDataUri = bufferToDataURI(audioBuffer, 'audio/mpeg');
            // Cleanup
            if (tempDirForChunks) {
                await fs.rm(tempDirForChunks, { recursive: true, force: true });
            }
            return { audioDataUri };
        }

        // Concatenate audio chunks using ffmpeg
        const finalListPath = path.join(tempDirForChunks, 'ffmpeg_list.txt');
        const fileListContent = chunkFilePaths.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
        await fs.writeFile(finalListPath, fileListContent);

        const finalConcatenatedPath = path.join(tempDirForChunks, `final_audio_concat.mp3`);
        const ffmpegCommand = `ffmpeg -y -f concat -safe 0 -i "${finalListPath}" -map_metadata -1 -fflags +igndts -ar 24000 -ac 1 -b:a 48k "${finalConcatenatedPath}"`;
        
        console.log(`Concatenating ${chunkFilePaths.length} audio chunks with ffmpeg...`);
        
        const { stdout: ffmpegStdout, stderr: ffmpegStderr } = await execAsync(ffmpegCommand, { timeout: 180000 });
        if (ffmpegStderr) console.warn("ffmpeg stderr:", ffmpegStderr);
        if (ffmpegStdout) console.log("ffmpeg stdout:", ffmpegStdout);
        
        console.log("Audio concatenation complete.");

        const audioBuffer = await fs.readFile(finalConcatenatedPath);
        if (audioBuffer.length === 0) {
            throw new Error('Generated audio file (after concatenation) was empty.');
        }

        const audioDataUri = bufferToDataURI(audioBuffer, 'audio/mpeg');
        console.log("Successfully converted audio buffer to Data URI.");

        if (tempDirForChunks) {
            await fs.rm(tempDirForChunks, { recursive: true, force: true });
            console.log(`Cleaned up temporary chunk directory: ${tempDirForChunks}`);
        }

        return { audioDataUri };

    } catch (error: any) {
        console.error('Error caught in generateVoiceOverAudioFlow:', error);
        if (tempDirForChunks) {
            try {
                await fs.rm(tempDirForChunks, { recursive: true, force: true });
                console.log(`Cleaned up temporary chunk directory after error: ${tempDirForChunks}`);
            } catch (cleanupError) {
                console.warn(`Failed to clean up temporary chunk directory "${tempDirForChunks}" after error:`, cleanupError);
            }
        }
        const specificErrorMessage = error instanceof Error ? error.message : JSON.stringify(error);
        const finalMessage = `Failed to generate voice over audio: ${specificErrorMessage}`;
        console.error("Final Error Message to Throw:", finalMessage);
        throw new Error(finalMessage);
    }
});
