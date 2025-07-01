import { z } from 'zod';

export const GenerateSrtFromAudioInputSchema = z.object({
    audioFile: z.union([z.instanceof(File), z.array(z.instanceof(File))]), 
    languageCode: z.string().default('en-US')
});

export const GenerateSrtFromAudioOutputSchema = z.object({
    srtContent: z.string()
});

const secondsToSrtTime = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
};

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
                throw new Error(`Transcription failed for chunk ${chunkFile.name}: ${response.statusText}`);
            }

            const result = await response.json();
            const chunkSrt: string = result.srtContent;

            const srtEntries = chunkSrt.split(/\r?\n\r?\n/);
            for (const entry of srtEntries) {
                if (entry.trim() === "") continue;
                const lines = entry.split(/\r?\n/);
                if (lines.length < 2) continue;

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
        }
        
        return GenerateSrtFromAudioOutputSchema.parse({
            srtContent: combinedSrtContent.trim()
        });
    } catch (error: any) {
        console.error('Error in generateSrtFromAudio (chunked):', error);
        throw new Error(`Failed to generate SRT: ${error.message}`);
    }
}