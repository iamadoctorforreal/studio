'use client';

import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, PlayCircle } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { generateVoiceOverAudio } from '@/ai/flows/generate-voice-over-audio';
import type { GenerateVoiceOverAudioOutput } from '@/ai/flows/generate-voice-over-audio';

const formSchema = z.object({
  articleText: z.string().min(50, {
    message: "Article text must be at least 50 characters.",
  }),
});

type VoiceOverFormValues = z.infer<typeof formSchema>;

const VoiceOverGenerator: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [audioResult, setAudioResult] = useState<GenerateVoiceOverAudioOutput | null>(null);
  const { toast } = useToast();

  const form = useForm<VoiceOverFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      articleText: "",
    },
  });

  // NOTE: The actual audio generation logic using huggingface needs implementation.
  // The current AI flow `generateVoiceOverAudio` is a placeholder.
  const onSubmit = async (values: VoiceOverFormValues) => {
    setIsLoading(true);
    setAudioResult(null);
    toast({
        title: "Generating Voice-Over",
        description: "This may take a moment. Feature currently under development.",
      });
    // Simulating API call delay for placeholder
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
      // TODO: Replace this with actual call to huggingface/Edge-TTS model logic
      // The current genkit flow likely won't work without the TTS implementation.
      // const result = await generateVoiceOverAudio(values);
      // setAudioResult(result);

      // Placeholder result:
      setAudioResult({ audioUrl: 'placeholder_audio_url.mp3' }); // Replace with actual URL when implemented

      toast({
        title: "Voice-Over Generated (Placeholder)",
        description: "Successfully generated the voice-over audio (placeholder).",
      });
    } catch (error) {
      console.error("Error generating voice-over:", error);
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: "Could not generate the voice-over audio. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
     <Card>
        <CardHeader>
            <CardTitle>Voice-Over Generator</CardTitle>
            <CardDescription>Generate voice-over audio from the formatted article text. (Feature Under Development)</CardDescription>
        </CardHeader>
        <CardContent>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                    control={form.control}
                    name="articleText"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Article Text</FormLabel>
                        <FormControl>
                        <Textarea
                            placeholder="Paste the full article text here..."
                            {...field}
                            className="min-h-[250px]"
                            />
                        </FormControl>
                        <FormDescription>
                        The complete text of the article to be converted to audio.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <Button type="submit" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Generate Voice-Over
                </Button>
                </form>
            </Form>

             {audioResult && (
                <div className="mt-6 pt-6 border-t">
                <h3 className="text-lg font-semibold mb-2">Generated Audio:</h3>
                 {/* Basic Audio Player - Replace with a more robust component if needed */}
                 <div className="flex items-center gap-4 p-4 bg-secondary rounded-md">
                    <PlayCircle className="h-8 w-8 text-primary" />
                    {/* In a real scenario, you'd use an <audio> tag */}
                    {/* <audio controls src={audioResult.audioUrl}>
                        Your browser does not support the audio element.
                    </audio> */}
                    <span className="text-sm text-muted-foreground">Audio playback controls would appear here. URL: {audioResult.audioUrl}</span>
                 </div>
                </div>
            )}
        </CardContent>
    </Card>
  );
};

export default VoiceOverGenerator;
