import { z } from 'zod';

export const GenerateSrtFromAudioInputSchema = z.object({
    // Expect an array of files or a single file (for backward compatibility or simpler cases if needed)
    audioFile: z.union([z.instanceof(File), z.array(z.instanceof(File))]), 
    languageCode: z.string().default('en-US')
});

export const GenerateSrtFromAudioOutputSchema = z.object({
    srtContent: z.string()
});

// Helper to convert seconds to SRT time format HH:MM:SS,mmm
const secondsToSrtTime = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
};

// Helper to parse SRT time format HH:MM:SS,mmm to seconds
const srtTimeToSeconds = (time: string): number => {
    const [timePart, msPart] = time.split(',');
    const [hours, minutes, seconds] = timePart.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds + Number(msPart) / 1000;
};

export async function generateSrtFromAudio(input: z.infer<typeof GenerateSrtFromAudioInputSchema>) {
    const validatedInput = GenerateSrtFromAudioInputSchema.parse(input);

    try {
        const audioFiles = Array.isArray(validatedInput.audioFile) ? validatedInput.audioFile : [validatedInput.audioFile];
        let combinedSrtContent = "";
        let cumulativeDuration = 0;
        let srtSequenceNumber = 1;

        for (const chunkFile of audioFiles) {
            let formData = new FormData();
            formData.append('file', chunkFile);
            formData.append('languageCode', validatedInput.languageCode);

            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                // Consider how to handle partial failures: stop all, or try to continue?
                throw new Error(`Transcription failed for chunk ${chunkFile.name}: ${response.statusText}`);
            }

            const result = await response.json();
            const chunkSrt: string = result.srtContent;

            // Adjust timestamps and append to combinedSrtContent
            const srtEntries = chunkSrt.split(/\r?\n\r?\n/);
            for (const entry of srtEntries) {
                if (entry.trim() === "") continue;
                const lines = entry.split(/\r?\n/);
                if (lines.length < 2) continue; // Should have at least number and time

                // lines[0] is sequence, lines[1] is time, lines[2+] is text
                const timeLine = lines[1];
                const [startTimeStr, endTimeStr] = timeLine.split(' --> ');

                const chunkStartTime = srtTimeToSeconds(startTimeStr);
                const chunkEndTime = srtTimeToSeconds(endTimeStr);

                const adjustedStartTime = secondsToSrtTime(cumulativeDuration + chunkStartTime);
                const adjustedEndTime = secondsToSrtTime(cumulativeDuration + chunkEndTime);

                combinedSrtContent += `${srtSequenceNumber}\r\n`;
                combinedSrtContent += `${adjustedStartTime} --> ${adjustedEndTime}\r\n`;
                combinedSrtContent += lines.slice(2).join('\r\n') + '\r\n\r\n';
                srtSequenceNumber++;
            }
            // A simple way to estimate chunk duration for offset. 
            // More accurately, you'd get this from the last timestamp of the chunk's SRT or the chunk audio itself.
            // For now, we assume chunks are roughly sequential and their internal SRTs start near 0.
            // This needs refinement if chunks have significant silence at start/end or if precise duration is known.
            // A better approach: parse the last timestamp of `chunkSrt` to determine its duration.
            if (srtEntries.length > 0) {
                const lastEntry = srtEntries.filter(e => e.trim() !== "").pop();
                if (lastEntry) {
                    const lastTimeLine = lastEntry.split(/\r?\n/)[1];
                    if (lastTimeLine) {
                        const [, lastEndTimeStr] = lastTimeLine.split(' --> ');
                        cumulativeDuration += srtTimeToSeconds(lastEndTimeStr); 
                    }
                }
            }
            // Fallback if no entries, or consider a fixed duration if known (e.g. 30s)
            // else { cumulativeDuration += 30; // Or actual chunk duration if known }
        }
        
        return GenerateSrtFromAudioOutputSchema.parse({
            srtContent: combinedSrtContent.trim()
        });
    } catch (error: any) {
        console.error('Error in generateSrtFromAudio (chunked):', error);
        throw new Error(`Failed to generate SRT: ${error.message}`);
    }
}
