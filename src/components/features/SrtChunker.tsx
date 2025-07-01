"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { generateSrtChunkKeywords } from "@/ai/flows/generate-srt-chunk-keywords";
import { generateSrtChunkSummary } from "@/ai/flows/generate-srt-chunk-summary";
import { useVideoWorkflow } from "@/contexts/VideoWorkflowContext"; 

type Chunk = {
  startTime: string;
  endTime: string;
  text: string;
  keywords: string;
  summary: string;
};

function parseTimeToSeconds(time: string): number {
  const [hours, minutes, rest] = time.split(":");
  const [seconds, milliseconds] = rest.split(",");
  return (
    parseInt(hours) * 3600 +
    parseInt(minutes) * 60 +
    parseInt(seconds) +
    parseInt(milliseconds) / 1000
  );
}

function secondsToTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    secs
  ).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

const SrtChunker = () => {
  const { toast } = useToast();
  const { generatedAudio } = useVideoWorkflow();
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [originalContent, setOriginalContent] = useState<string>("");
  const [chunkedSrt, setChunkedSrt] = useState<Chunk[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSrtGeneration, setIsLoadingSrtGeneration] = useState(false);

  useEffect(() => {
    if (generatedAudio?.file) {
      setAudioFile(generatedAudio.file);
      toast({
        title: "Voice-over Loaded",
        description: `"${generatedAudio.fileName}" loaded from previous step.`,
      });
    }
  }, [generatedAudio, toast]);

  const handleSrtFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSrtFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setOriginalContent(content);
      };
      reader.readAsText(file);
    }
  };

  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
    }
  };

  const handleGenerateSrtFromAudio = async () => {
    if (!audioFile) {
      toast({ title: "No Audio File", description: "Please upload an audio file first.", variant: "destructive" });
      return;
    }

    setIsLoadingSrtGeneration(true);
    setOriginalContent("");
    setChunkedSrt(null);

    try {
      toast({ title: "Transcribing Audio", description: "Using Hugging Face Whisper to transcribe the audio file." });

      const formData = new FormData();
      formData.append('file', audioFile);
      formData.append('languageCode', 'en-US');

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.statusText}`);
      }

      const result = await response.json();
      setOriginalContent(result.srtContent);
      toast({ title: "SRT Generated", description: "SRT content generated from audio." });
    } catch (error: any) {
      console.error('Error transcribing audio:', error);
      toast({
        variant: "destructive",
        title: "Transcription Failed",
        description: `An error occurred: ${error.message}`
      });
    } finally {
      setIsLoadingSrtGeneration(false);
    }
  };

  const handleProcessAndChunkSrt = async () => {
    if (!originalContent) {
      toast({ title: "No SRT Content", description: "Please generate or upload SRT first.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const lines = originalContent.split("\n");
      const entries: { startTime: number; endTime: number; text: string }[] = [];
      let currentEntry: Partial<{ startTime: number; endTime: number; text: string[] }> = {};

      for (const line of lines) {
          if (line.match(/^\d+$/)) {
              if (currentEntry.startTime !== undefined && currentEntry.endTime !== undefined && currentEntry.text) {
                  entries.push({
                      startTime: currentEntry.startTime,
                      endTime: currentEntry.endTime,
                      text: currentEntry.text.join(' ').trim()
                  });
              }
              currentEntry = { text: [] };
          } else if (line.includes('-->')) {
              const [start, end] = line.split(' --> ');
              currentEntry.startTime = parseTimeToSeconds(start.trim());
              currentEntry.endTime = parseTimeToSeconds(end.trim());
          } else if (line.trim() !== '' && currentEntry.text) {
              currentEntry.text.push(line.trim());
          }
      }
      if (currentEntry.startTime !== undefined && currentEntry.endTime !== undefined && currentEntry.text) {
          entries.push({
              startTime: currentEntry.startTime,
              endTime: currentEntry.endTime,
              text: currentEntry.text.join(' ').trim()
          });
      }

      const chunks: Chunk[] = [];
      if (entries.length > 0) {
        let currentChunkStartTime = entries[0].startTime;
        let currentChunkText = "";
        let chunkEndTime = entries[0].startTime;

        for (const entry of entries) {
            if (entry.endTime <= currentChunkStartTime + 30) {
                currentChunkText += (currentChunkText ? " " : "") + entry.text;
                chunkEndTime = Math.max(chunkEndTime, entry.endTime);
            } else {
                if (currentChunkText) {
                    const keywordsOutput = await generateSrtChunkKeywords({ chunkText: currentChunkText });
                    const summaryOutput = await generateSrtChunkSummary({ chunkText: currentChunkText });
                    chunks.push({
                        startTime: secondsToTime(currentChunkStartTime),
                        endTime: secondsToTime(chunkEndTime),
                        text: currentChunkText,
                        keywords: keywordsOutput.keywords.join(', ') || "N/A",
                        summary: summaryOutput.summary || "N/A",
                    });
                }
                currentChunkStartTime = entry.startTime;
                currentChunkText = entry.text;
                chunkEndTime = entry.endTime;
            }
        }
        if (currentChunkText) {
            const keywordsOutput = await generateSrtChunkKeywords({ chunkText: currentChunkText });
            const summaryOutput = await generateSrtChunkSummary({ chunkText: currentChunkText });
            chunks.push({
                startTime: secondsToTime(currentChunkStartTime),
                endTime: secondsToTime(chunkEndTime),
                text: currentChunkText,
                keywords: keywordsOutput.keywords.join(', ') || "N/A",
                summary: summaryOutput.summary || "N/A",
            });
        }
      }
      setChunkedSrt(chunks);
      toast({ title: "SRT Processed", description: `Successfully chunked SRT. ${chunks.length} chunks created.` });
    } catch (error: any) {
      console.error("Error processing SRT:", error);
      toast({ variant: "destructive", title: "Processing Failed", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadSrt = () => {
    if (!originalContent) return;
    const blob = new Blob([originalContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcript.srt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadChunkedSrt = () => {
    if (!chunkedSrt || chunkedSrt.length === 0) return;
    const content = chunkedSrt.map(c => `Chunk: ${c.startTime} - ${c.endTime}\nText: ${c.text}\nKeywords: ${c.keywords}\nSummary: ${c.summary}\n\n`).join('');
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chunked_srt_data.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="w-full max-w-4xl mx-auto p-6">
      <CardHeader>
        <CardTitle>SRT Chunker</CardTitle>
        <CardDescription>Upload an SRT or generate one from audio, then process into chunks.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="srt-file-upload">Upload SRT File</Label>
            <Input id="srt-file-upload" type="file" accept=".srt" onChange={handleSrtFileChange} />
          </div>
          <div>
            <Label htmlFor="audio-file-upload">Or Upload Audio File</Label>
            <Input id="audio-file-upload" type="file" accept="audio/*" onChange={handleAudioFileChange} />
          </div>
        </div>
        <Button onClick={handleGenerateSrtFromAudio} disabled={!audioFile || isLoadingSrtGeneration} className="w-full">
          {isLoadingSrtGeneration ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating SRT...</>
          ) : "Generate SRT From Audio"}
        </Button>
        <Button onClick={handleProcessAndChunkSrt} disabled={isLoading || !originalContent} className="w-full">
          {isLoading && !isLoadingSrtGeneration ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : "Process and Chunk SRT"}
        </Button>
        {originalContent && (
          <Button onClick={handleDownloadSrt} variant="outline" className="w-full">Download Original SRT</Button>
        )}
        {chunkedSrt && chunkedSrt.length > 0 && (
          <Button onClick={handleDownloadChunkedSrt} variant="outline" className="w-full">Download Chunked Data</Button>
        )}
        {chunkedSrt && (
          <ScrollArea className="h-96 border rounded p-4 mt-4">
            {chunkedSrt.map((chunk, idx) => (
              <div key={idx} className="mb-6 border-b pb-4">
                <div className="text-sm text-muted-foreground mb-1">{chunk.startTime} → {chunk.endTime}</div>
                <div className="font-medium mb-1">{chunk.text}</div>
                <div className="text-xs"><strong>Keywords:</strong> {chunk.keywords}</div>
                <div className="text-xs"><strong>Summary:</strong> {chunk.summary}</div>
              </div>
            ))}
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default SrtChunker;