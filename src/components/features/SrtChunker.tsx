'use client';

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
// Removed duplicate: import React, { useState, useEffect } from 'react'; 
import { Loader2, Scissors, FileAudio, FileType } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from '@/components/ui/scroll-area';
import { useVideoWorkflow } from '@/contexts/VideoWorkflowContext';
import { generateSrtChunkKeywords } from '@/ai/flows/generate-srt-chunk-keywords';
import { generateSrtChunkSummary } from '@/ai/flows/generate-srt-chunk-summary';
import { generateSrtFromAudio } from '@/ai/flows/generate-srt-from-audio';
// Remove the fs import
// import { promises as fs } from 'fs';
import path from 'path';
import { storageService } from '@/services/storage';
interface SrtChunk {
    startTime: string;
    endTime: string;
    text: string;
    keywords?: string;
    summary?: string;
}

const SrtChunker: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSrtGeneration, setIsLoadingSrtGeneration] = useState(false);
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [gcsUri, setGcsUri] = useState<string>(""); // For manual GCS URI input
  const [originalContent, setOriginalContent] = useState<string>("");
  const [chunkedSrt, setChunkedSrt] = useState<SrtChunk[] | null>(null);
  const { toast } = useToast();
  const { generatedAudio, clearGeneratedAudio } = useVideoWorkflow();

  useEffect(() => {
    if (generatedAudio?.file) {
      toast({
        title: "Voice-over Loaded",
        description: `"${generatedAudio.fileName}" loaded from previous step. Generating SRT...`,
      });
      setAudioFile(generatedAudio.file);
      // Automatically trigger SRT generation
      // Need to ensure handleGenerateSrtFromAudio can use the state `audioFile`
      // which might not be updated immediately. So, pass the file directly or call after state update.
      // For simplicity, we'll rely on a subsequent call or a small delay if direct call is problematic.
      // Or, better, make handleGenerateSrtFromAudio accept a file.
      // For now, let's set the state and then call it.
      // The handleGenerateSrtFromAudio function will use the `audioFile` state.
      // To ensure it uses the *new* audioFile, we can make it a dependency of another effect,
      // or call it directly if we are sure the state update is processed.
      // A direct call here might use the stale `audioFile` state.
      // A more robust way:
      // 1. Set audioFile state.
      // 2. Have another useEffect that triggers when `audioFile` (from context) changes.
    }
  }, [generatedAudio]); // React to changes in generatedAudio from context

  // Effect to auto-trigger STT when audioFile is set from context
  useEffect(() => {
    if (audioFile && generatedAudio && audioFile.name === generatedAudio.fileName) {
      // This check ensures we only auto-trigger for the file from context
      handleGenerateSrtFromAudio(audioFile); // Pass the file to ensure it uses the correct one
      clearGeneratedAudio(); // Clear from context after processing
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [audioFile, generatedAudio]); // Dependencies: audioFile state and generatedAudio from context


  const handleSrtFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.endsWith('.srt')) {
      setSrtFile(file);
      setAudioFile(null); // Clear audio file if SRT is selected
      const reader = new FileReader();
      reader.onload = (e) => {
        setOriginalContent(e.target?.result as string);
        setChunkedSrt(null); 
      };
      reader.readAsText(file);
    } else {
      setSrtFile(null);
      setOriginalContent("");
      setChunkedSrt(null);
      toast({
        variant: "destructive",
        title: "Invalid File",
        description: "Please select a valid .srt file.",
      });
    }
  };

  const handleAudioFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const acceptedAudioTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/ogg', 'audio/flac'];
    if (file && acceptedAudioTypes.includes(file.type)) {
      setAudioFile(file); // This will be a manually uploaded file
      setSrtFile(null); 
      setOriginalContent(""); 
      setChunkedSrt(null);
      if (generatedAudio) clearGeneratedAudio(); // Clear context if user uploads manually
    } else {
      setAudioFile(null);
      toast({
        variant: "destructive",
        title: "Invalid Audio File",
        description: "Please select a valid audio file (e.g., MP3, WAV, FLAC).",
      });
    }
  };

  // Modified to accept an optional file argument for direct processing from context
  const handleGenerateSrtFromAudio = async (fileToProcess?: File | null) => {
      const currentAudioFile = fileToProcess || audioFile;
  
      if (!currentAudioFile) {
        toast({ title: "No Audio Source", description: "Please upload an audio file first.", variant: "destructive" });
        return;
      }
  
      setIsLoadingSrtGeneration(true);
      setOriginalContent("");
      setChunkedSrt(null);
  
      try {
        // Create a FormData object
        const formData = new FormData();
        formData.append('file', currentAudioFile);
  
        // Upload directly to your API endpoint
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
  
        if (!response.ok) {
          throw new Error('Failed to upload file');
        }
  
        const { audioFileUri } = await response.json();
  
        // Now use the GCS URI for speech-to-text
        const result = await generateSrtFromAudio({ audioFileUri, languageCode: 'en-US' });
        setOriginalContent(result.srtContent);
        toast({ title: "SRT Generated", description: `SRT content generated from audio file.` });
      } catch (error: any) {
        console.error('Error processing audio:', error);
        toast({ 
          variant: "destructive", 
          title: "SRT Generation Failed", 
          description: error.message 
        });
        setOriginalContent("");
      } finally {
        setIsLoadingSrtGeneration(false);
      }
  };

  // Basic time string to seconds conversion
  const timeToSeconds = (time: string): number => {
          const parts = time.split(':');
          const secondsParts = parts[2].split(',');
          return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(secondsParts[0]) + parseInt(secondsParts[1]) / 1000;
  };

  // Basic seconds to time string conversion
    const secondsToTime = (seconds: number): string => {
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        const ms = Math.round((seconds % 1) * 1000).toString().padStart(3, '0');
        return `${h}:${m}:${s},${ms}`;
    };


  // SRT parsing and chunking logic (now called handleProcessAndChunkSrt)
    const handleProcessAndChunkSrt = async () => {
        if (!originalContent) {
            toast({ title: "No SRT Content", description: "Please upload an SRT file or generate one from audio first.", variant: "destructive" });
            return;
        }

        setIsLoading(true);
        setChunkedSrt(null); // Clear previous chunks

        // Simulate processing delay for chunking part if needed, or remove if AI calls are main delay
        // await new Promise(resolve => setTimeout(resolve, 500)); 

        try {
            const lines = originalContent.split(/\r?\n/);
            const entries: { startTime: number; endTime: number; text: string }[] = [];
            let currentEntry: Partial<{ startTime: number; endTime: number; text: string[] }> = {};

            for (const line of lines) {
                if (line.match(/^\d+$/)) { // Sequence number
                    if (currentEntry.startTime !== undefined) {
                        entries.push({
                           startTime: currentEntry.startTime,
                           endTime: currentEntry.endTime!,
                           text: currentEntry.text!.join(' ').trim()
                        });
                    }
                    currentEntry = { text: [] };
                } else if (line.includes('-->')) { // Timecodes
                    const [start, end] = line.split(' --> ');
                    currentEntry.startTime = timeToSeconds(start.trim());
                    currentEntry.endTime = timeToSeconds(end.trim());
                } else if (line.trim() !== '' && currentEntry.text) { // Text lines
                    currentEntry.text.push(line.trim());
                }
            }
            if (currentEntry.startTime !== undefined) { // Add last entry
                 entries.push({
                     startTime: currentEntry.startTime,
                     endTime: currentEntry.endTime!,
                     text: currentEntry.text!.join(' ').trim()
                 });
            }

            // Chunking logic (simple example: combine entries within 15s blocks)
            const chunks: SrtChunk[] = [];
            let currentChunkStartTime = 0;
            let currentChunkText = "";

            if (entries.length === 0) {
                 toast({ variant: "destructive", title: "Parsing Error", description: "Could not parse SRT file." });
                 setIsLoading(false);
                 return;
            }


            let chunkEndTime = entries[0].startTime;

             for (const entry of entries) {
                 if (entry.startTime < currentChunkStartTime + 15) {
                     currentChunkText += (currentChunkText ? " " : "") + entry.text;
                     chunkEndTime = Math.max(chunkEndTime, entry.endTime);
                 } else {
                     // Save previous chunk
                     if (currentChunkText) {
                        let keywordsResult = "N/A";
                        let summaryResult = "N/A";
                        try {
                            const keywordsOutput = await generateSrtChunkKeywords({ chunkText: currentChunkText });
                            keywordsResult = keywordsOutput.keywords.join(', ') || "N/A";
                        } catch (e: any) {
                            console.error("Error generating keywords:", e);
                            toast({ variant: "destructive", title: "Keyword Generation Failed", description: e.message });
                        }
                        try {
                            const summaryOutput = await generateSrtChunkSummary({ chunkText: currentChunkText });
                            summaryResult = summaryOutput.summary || "N/A";
                        } catch (e: any) {
                            console.error("Error generating summary:", e);
                            toast({ variant: "destructive", title: "Summary Generation Failed", description: e.message });
                        }

                        chunks.push({
                            startTime: secondsToTime(currentChunkStartTime),
                            endTime: secondsToTime(chunkEndTime),
                            text: currentChunkText,
                            keywords: keywordsResult,
                            summary: summaryResult,
                        });
                     }
                     // Start new chunk
                     currentChunkStartTime = entry.startTime;
                     currentChunkText = entry.text;
                     chunkEndTime = entry.endTime;
                 }
             }

            // Add the last chunk
            if (currentChunkText) {
                let keywordsResultLast = "N/A";
                let summaryResultLast = "N/A";
                try {
                    const keywordsOutput = await generateSrtChunkKeywords({ chunkText: currentChunkText });
                    keywordsResultLast = keywordsOutput.keywords.join(', ') || "N/A";
                } catch (e: any) {
                    console.error("Error generating keywords for last chunk:", e);
                    toast({ variant: "destructive", title: "Keyword Generation Failed", description: e.message });
                }
                try {
                    const summaryOutput = await generateSrtChunkSummary({ chunkText: currentChunkText });
                    summaryResultLast = summaryOutput.summary || "N/A";
                } catch (e: any) {
                    console.error("Error generating summary for last chunk:", e);
                    toast({ variant: "destructive", title: "Summary Generation Failed", description: e.message });
                }

                chunks.push({
                    startTime: secondsToTime(currentChunkStartTime),
                    endTime: secondsToTime(chunkEndTime),
                    text: currentChunkText,
                    keywords: keywordsResultLast,
                    summary: summaryResultLast,
                });
            }


            setChunkedSrt(chunks);
            toast({
                title: "SRT Processed",
                description: `Successfully chunked the SRT file. ${chunks.length > 0 ? 'Keywords and summaries generated.' : 'No chunks were generated.'}`,
            });

        } catch (error) {
            console.error("Error processing SRT:", error);
            toast({
                variant: "destructive",
                title: "Processing Failed",
                description: "Could not process the SRT file.",
            });
        } finally {
            setIsLoading(false);
        }
    };


  return (
    <Card>
      <CardHeader>
        <CardTitle>SRT File Processor</CardTitle>
        <CardDescription>
          Upload an audio file to generate SRT, or upload an existing SRT file.
          Then, chunk the SRT into 15-second blocks, extract keywords, and summarize each block.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div className="space-y-2">
            <Label htmlFor="audio-file" className="flex items-center gap-1"><FileAudio size={16}/> Upload Audio to Generate SRT</Label>
            <Input id="audio-file" type="file" accept="audio/*" onChange={handleAudioFileChange} />
            {audioFile && <p className="text-sm text-muted-foreground">Selected audio: {audioFile.name}</p>}
            <Button onClick={() => handleGenerateSrtFromAudio()} disabled={!audioFile || isLoadingSrtGeneration || isLoading} className="w-full">
              {isLoadingSrtGeneration ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileType className="mr-2 h-4 w-4" />}
              Generate SRT from Audio
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="srt-file" className="flex items-center gap-1"><FileType size={16}/> Or Upload Existing SRT File</Label>
            <Input id="srt-file" type="file" accept=".srt" onChange={handleSrtFileChange} />
            {srtFile && <p className="text-sm text-muted-foreground">Selected SRT: {srtFile.name}</p>}
          </div>
        </div>

        {originalContent && (
            <div className="space-y-2 mt-6 pt-6 border-t">
                 <Label>SRT Content (Preview)</Label>
                <ScrollArea className="h-40 w-full rounded-md border p-2 bg-muted/30">
                    <pre className="text-xs">{originalContent}</pre>
                </ScrollArea>
            </div>
        )}

        <Button onClick={handleProcessAndChunkSrt} disabled={!originalContent || isLoading || isLoadingSrtGeneration} className="w-full mt-4">
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Scissors className="mr-2 h-4 w-4" />}
          Process and Chunk SRT
        </Button>

        {chunkedSrt && (
          <div className="mt-6 pt-6 border-t">
            <h3 className="text-lg font-semibold mb-2">Chunked SRT Results:</h3>
             <ScrollArea className="h-72 w-full rounded-md border">
                <div className="p-4 space-y-4">
                    {chunkedSrt.map((chunk, index) => (
                    <div key={index} className="p-3 bg-secondary rounded-md shadow-sm">
                        <p className="text-sm font-mono text-muted-foreground">{chunk.startTime} --&gt; {chunk.endTime}</p>
                        <p className="mt-1 text-sm">{chunk.text}</p>
                         <p className="mt-2 text-xs"><strong>Keywords:</strong> {chunk.keywords || 'N/A'}</p>
                         <p className="mt-1 text-xs"><strong>Summary:</strong> {chunk.summary || 'N/A'}</p>
                    </div>
                    ))}
                </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SrtChunker;
