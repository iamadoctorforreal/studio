'use client';

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Scissors } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from '@/components/ui/scroll-area';

interface SrtChunk {
    startTime: string;
    endTime: string;
    text: string;
    keywords?: string;
    summary?: string;
}

const SrtChunker: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [originalContent, setOriginalContent] = useState<string>("");
  const [chunkedSrt, setChunkedSrt] = useState<SrtChunk[] | null>(null);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.endsWith('.srt')) {
      setSrtFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setOriginalContent(e.target?.result as string);
        setChunkedSrt(null); // Reset chunks when new file is loaded
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


  // Placeholder SRT parsing and chunking logic
    const processSrt = async () => {
        if (!originalContent) return;

        setIsLoading(true);
        setChunkedSrt(null);

        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 1000));

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
                         chunks.push({
                             startTime: secondsToTime(currentChunkStartTime),
                             endTime: secondsToTime(chunkEndTime),
                             text: currentChunkText,
                             // TODO: Implement keyword extraction & summarization here (e.g., using another AI call)
                             keywords: "placeholder, keywords",
                             summary: "Placeholder summary for this 15s block."
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
                 chunks.push({
                    startTime: secondsToTime(currentChunkStartTime),
                    endTime: secondsToTime(chunkEndTime),
                    text: currentChunkText,
                    keywords: "placeholder, keywords",
                    summary: "Placeholder summary for the final block."
                 });
            }


            setChunkedSrt(chunks);
            toast({
                title: "SRT Processed",
                description: "Successfully chunked the SRT file and added placeholders.",
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
        <CardTitle>SRT File Chunker</CardTitle>
        <CardDescription>Chunk an SRT file into 15-second blocks, extract keywords, and summarize each block.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid w-full max-w-sm items-center gap-1.5">
          <Label htmlFor="srt-file">Upload SRT File</Label>
          <Input id="srt-file" type="file" accept=".srt" onChange={handleFileChange} />
          {!srtFile && <FormDescription>Please select a .srt file.</FormDescription>}
           {srtFile && <FormDescription>Selected: {srtFile.name}</FormDescription>}
        </div>

        {originalContent && (
            <div className="space-y-2">
                 <Label>Original SRT Content (Preview)</Label>
                <ScrollArea className="h-40 w-full rounded-md border p-2">
                    <pre className="text-xs">{originalContent}</pre>
                </ScrollArea>
            </div>
        )}

        <Button onClick={processSrt} disabled={!srtFile || isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Scissors className="mr-2 h-4 w-4" />}
          Chunk SRT File
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
