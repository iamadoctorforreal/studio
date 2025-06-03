import { useState } from 'react';
import { useVideoWorkflow } from '@/contexts/VideoWorkflowContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function AudioTranscriber() {
  const { generatedAudio } = useVideoWorkflow();
  const { toast } = useToast();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [srtContent, setSrtContent] = useState<string | null>(null);

  const handleTranscribe = async () => {
    if (!generatedAudio?.file) {
      toast({
        title: "No Audio File",
        description: "Please generate or upload an audio file first.",
        variant: "destructive"
      });
      return;
    }

    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('file', generatedAudio.file);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.statusText}`);
      }

      const result = await response.json();
      setSrtContent(result.srtContent);

      toast({
        title: "Transcription Complete",
        description: "SRT file has been generated successfully."
      });
    } catch (error) {
      console.error('Transcription error:', error);
      toast({
        title: "Transcription Failed",
        description: error instanceof Error ? error.message : "Failed to transcribe audio",
        variant: "destructive"
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleDownloadSrt = () => {
    if (!srtContent) return;

    const blob = new Blob([srtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedAudio?.fileName.replace(/\.[^/.]+$/, '')}.srt` || 'transcription.srt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button
          onClick={handleTranscribe}
          disabled={isTranscribing || !generatedAudio?.file}
        >
          {isTranscribing ? "Transcribing..." : "Transcribe Audio"}
        </Button>
        {srtContent && (
          <Button onClick={handleDownloadSrt} variant="outline">
            Download SRT
          </Button>
        )}
      </div>
      {srtContent && (
        <div className="mt-4 p-4 bg-muted rounded-md">
          <pre className="whitespace-pre-wrap text-sm">{srtContent}</pre>
        </div>
      )}
    </div>
  );
}