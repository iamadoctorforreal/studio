'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating an SRT file string
 *              from a given audio file using a Speech-to-Text (STT) service.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';
import { SpeechClient, protos } from '@google-cloud/speech';
import { Storage } from '@google-cloud/storage'; // Import Storage
import { promises as fs } from 'fs';
import path from 'path';
import { storageService } from '@/services/storage';

let speechClientInstance: SpeechClient | null = null;
let storageClientInstance: Storage | null = null;

// Helper function to get the SpeechClient instance
function getSpeechClient(): SpeechClient {
    if (!speechClientInstance) {
        // Assumes GOOGLE_APPLICATION_CREDENTIALS environment variable is set
        // or running in a GCP environment with appropriate service account permissions.
        speechClientInstance = new SpeechClient();
    }
    return speechClientInstance;
}

// Helper function to get the Storage instance
// Remove these as we'll use the StorageService instead
// let storageClientInstance: Storage | null = null;
// function getStorageClient(): Storage {
//     if (!storageClientInstance) {
//         storageClientInstance = new Storage();
//     }
//     return storageClientInstance;
// }

const GenerateSrtFromAudioInputSchema = z.union([
    z.object({
        audioFileUri: z.string().describe('The GCS URI of the audio file to transcribe (e.g., gs://bucket-name/audio.mp3).'),
        languageCode: z.string().optional().default('en-US').describe('Language code for transcription (e.g., en-US, es-ES).'),
    }),
    z.object({
        audioFile: z.any().describe('The audio file object to transcribe.  Will be uploaded to GCS.'), // z.instanceof(File) is not working correctly
        languageCode: z.string().optional().default('en-US').describe('Language code for transcription (e.g., en-US, es-ES).'),
    })
]);
export type GenerateSrtFromAudioInput = z.infer<
  typeof GenerateSrtFromAudioInputSchema
>;

const GenerateSrtFromAudioOutputSchema = z.object({
  srtContent: z.string().describe('The generated SRT (SubRip Text) content as a string.'),
});
export type GenerateSrtFromAudioOutput = z.infer<
  typeof GenerateSrtFromAudioOutputSchema
>;

function formatSrtTime(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.round((totalSeconds % 1) * 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
}

// Helper to safely convert Long | number | string | null | undefined to number
const toNumber = (val: number | Long | string | null | undefined): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'object' && val.hasOwnProperty('low') && val.hasOwnProperty('high')) { // Crude check for Long
      return (val as Long).toNumber();
    }
    return Number(val);
};

// Update the upload function to use our StorageService
async function uploadAudioToGCS(audioFile: any): Promise<string> {
    try {
        const arrayBuffer = await audioFile.arrayBuffer();
        const tempPath = path.join(process.cwd(), 'temp', `audio_${Date.now()}_${audioFile.name}`);
        
        // Ensure temp directory exists
        await fs.mkdir(path.dirname(tempPath), { recursive: true });
        
        // Write to temp file
        await fs.writeFile(tempPath, Buffer.from(arrayBuffer));
        
        // Upload using StorageService
        const gcsUri = await storageService.uploadFile(tempPath, 'audio');
        
        // Clean up temp file
        await fs.unlink(tempPath);
        
        console.log(`Successfully uploaded audio to GCS: ${gcsUri}`);
        return gcsUri;
    } catch (error: any) {
        console.error(`Error uploading audio to GCS:`, error);
        throw new Error(`Failed to upload audio to GCS: ${error.message}`);
    }
}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
// Add after the imports
async function testGcsConnection() {
    try {
        console.log('Testing GCS connection...');
        
        // Create a test file
        const testContent = 'This is a test file for GCS connection';
        const testFilePath = path.join(process.cwd(), 'temp-test.txt');
        
        // Write test content
        await fs.writeFile(testFilePath, testContent);
        console.log('Created test file:', testFilePath);
        
        // Try to upload to GCS
        const gcsUri = await storageService.uploadFile(testFilePath, 'test');
        console.log('Successfully uploaded to GCS:', gcsUri);
        
        // Clean up
        await fs.unlink(testFilePath);
        console.log('Test file cleaned up');
        
        return true;
    } catch (error) {
        console.error('GCS connection test failed:', error);
        return false;
    }
}

// Add this at the start of your generateSrtFromAudio function
export const generateSrtFromAudio = ai.defineFlow<
  typeof GenerateSrtFromAudioInputSchema,
  typeof GenerateSrtFromAudioOutputSchema
>(
  {
    name: 'generateSrtFromAudioFlow',
    inputSchema: GenerateSrtFromAudioInputSchema,
    outputSchema: GenerateSrtFromAudioOutputSchema,
  },
  async (input) => {
    // Test GCS connection first
    const isGcsConnected = await testGcsConnection();
    if (!isGcsConnected) {
        throw new Error('Failed to connect to Google Cloud Storage. Please check your credentials and permissions.');
    }
    
    let audioFileUri: string;

    if ('audioFile' in input) {
        console.log("Received audio file object, uploading to GCS...");
        try {
            audioFileUri = await uploadAudioToGCS(input.audioFile);
        } catch (uploadError: any) {
            throw new Error(`Audio upload failed: ${uploadError.message}`);
        }
    } else if ('audioFileUri' in input) {
        if (!input.audioFileUri.startsWith('gs://')) {
            try {
                console.log("Processing audio URI...");
                console.log("URI format:", input.audioFileUri.substring(0, 30) + "..."); // Log the start of the URI for debugging
                
                let file: Buffer;
                if (input.audioFileUri.startsWith('data:')) {
                    // Handle data URI
                    const matches = input.audioFileUri.match(/^data:([^;]+);base64,(.+)$/);
                    if (!matches) {
                        throw new Error('URI must follow format: data:[MIME-type];base64,[base64-data]');
                    }
                    const [, mimeType, base64Data] = matches;
                    file = Buffer.from(base64Data, 'base64');
                } else if (input.audioFileUri.startsWith('http://') || input.audioFileUri.startsWith('https://')) {
                    // Handle HTTP(S) URLs
                    throw new Error('HTTP/HTTPS URLs are not supported yet. Please provide a data URI or gs:// URI');
                } else {
                    throw new Error('URI must start with "data:" or "gs://"');
                }

                const tempFileName = `audio_${Date.now()}.mp3`;
                const tempFilePath = path.join(process.cwd(), 'temp', tempFileName);
                
                // Ensure temp directory exists
                await fs.mkdir(path.dirname(tempFilePath), { recursive: true });
                
                // Write buffer to temp file
                await fs.writeFile(tempFilePath, file);
                
                // Upload to GCS
                audioFileUri = await storageService.uploadFile(tempFilePath, 'audio');
                
                // Clean up temp file
                await fs.unlink(tempFilePath);
            } catch (error: any) {
                console.error('Error processing URI:', error);
                throw new Error(`Failed to process audio URI: ${error.message}`);
            }
        } else {
            audioFileUri = input.audioFileUri;
        }
    } else {
        throw new Error("Invalid input: Must provide either audioFile or audioFileUri.");
    }

    console.log(`Starting STT for audio source: ${audioFileUri} with language ${input.languageCode}`);

    const client = getSpeechClient();

    const audio: protos.google.cloud.speech.v1.IRecognitionAudio = {
      uri: audioFileUri,
    };

    const config: protos.google.cloud.speech.v1.IRecognitionConfig = {
      languageCode: input.languageCode,
      enableWordTimeOffsets: true, // Crucial for SRT
      enableAutomaticPunctuation: true,
      // model: 'video', // Consider 'video' model for audio from video, or 'latest_long' for long audio
      // Use a diarization_config if you need to distinguish speakers
    };

    const request: protos.google.cloud.speech.v1.ILongRunningRecognizeRequest = {
      audio,
      config,
      // outputConfig: { // Optional: to write results directly to GCS
      //   gcsUri: `gs://your-output-bucket/transcripts/${Date.now()}_${path.basename(input.audioFileUri)}.json`,
      // },
    };

    try {
      console.log('Sending longRunningRecognize request to Google Cloud Speech-to-Text...');
      const [operation] = await client.longRunningRecognize(request);
      console.log('Waiting for transcription operation to complete...');
      const [response] = await operation.promise(); // Wait for transcription to complete
      console.log('Transcription operation completed.');

      if (!response.results || response.results.length === 0) {
        console.warn('No transcription results returned from STT service for URI:', audioFileUri);
        return { srtContent: "1\n00:00:00,000 --> 00:00:01,000\n[No speech detected or transcription empty]\n\n" };
      }

      let srtOutput = "";
      let sequenceNumber = 1;

      response.results.forEach(result => {
        // Each result can have multiple alternatives, we usually take the first one.
        if (result.alternatives && result.alternatives[0].words && result.alternatives[0].words.length > 0) {
          const words = result.alternatives[0].words as protos.google.cloud.speech.v1.IWordInfo[];
          
          // Simple SRT line creation: group words by result (often a sentence/phrase)
          const firstWord = words[0];
          const lastWord = words[words.length - 1];

          // Helper to safely convert Long | number | string | null | undefined to number
          const toNumber = (val: number | Long | string | null | undefined): number => {
            if (val === null || val === undefined) return 0;
            if (typeof val === 'object' && val.hasOwnProperty('low') && val.hasOwnProperty('high')) { // Crude check for Long
              return (val as Long).toNumber();
            }
            return Number(val);
          };

          const startTimeNanos = toNumber(firstWord.startTime?.nanos);
          const startTimeTotalSeconds = toNumber(firstWord.startTime?.seconds) + startTimeNanos / 1e9;
          
          const endTimeNanos = toNumber(lastWord.endTime?.nanos);
          const endTimeTotalSeconds = toNumber(lastWord.endTime?.seconds) + endTimeNanos / 1e9;

          if (endTimeTotalSeconds > startTimeTotalSeconds) { // Ensure valid duration
            srtOutput += `${sequenceNumber}\n`;
            srtOutput += `${formatSrtTime(startTimeTotalSeconds)} --> ${formatSrtTime(endTimeTotalSeconds)}\n`;
            srtOutput += `${result.alternatives[0].transcript}\n\n`;
            sequenceNumber++;
          }
        } else if (result.alternatives && result.alternatives[0].transcript) {
            // Fallback if word timings are not available for some reason, but transcript is.
            // This would create a less accurate SRT.
            console.warn("Result alternative found without word timings, using full transcript for a segment (less accurate SRT). Transcript:", result.alternatives[0].transcript);
            // For this fallback, we lack precise timing for this segment.
            // We could try to estimate or just create a single block if this happens often.
            // For now, we'll skip segments without word timings if others have them.
        }
      });
      
      if (!srtOutput) {
        const fullTranscript = response.results
            .map(r => r.alternatives && r.alternatives[0].transcript)
            .filter(Boolean)
            .join(' ');
        console.warn("No valid SRT entries with word timings generated. Full transcript (if any):", fullTranscript);
        return { srtContent: `1\n00:00:00,000 --> 00:00:05,000\n[Transcription completed, but word timings were not sufficient to generate detailed SRT. Full text: ${fullTranscript || 'Empty'}]\n\n` };
      }
      
      console.log(`STT flow completed. Generated SRT content of length: ${srtOutput.length}`);
      return { srtContent: srtOutput };

    } catch (error: any) {
      console.error('Error calling Google Cloud Speech-to-Text service:', error);
      // Provide more context if available (e.g., error.code, error.details)
      const errorMessage = error.details || error.message || "Unknown STT service error";
      throw new Error(`STT service failed: ${errorMessage}`);
    }
  }
);
