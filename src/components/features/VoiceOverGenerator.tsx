
'use client';

import React, { useState, useEffect } from 'react';
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
import { Loader2, PlayCircle, Download } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { generateVoiceOverAudio } from '@/ai/flows/generate-voice-over-audio';
import type { GenerateVoiceOverAudioOutput } from '@/ai/flows/generate-voice-over-audio';

const formSchema = z.object({
  articleText: z.string().min(50, {
    message: "Article text must be at least 50 characters.",
  }),
});

type VoiceOverFormValues = z.infer<typeof formSchema>;

interface VoiceOverGeneratorProps {
  initialArticleText?: string;
}

const VoiceOverGenerator: React.FC<VoiceOverGeneratorProps> = ({ initialArticleText = "" }) => {
  const [isLoading, setIsLoading] = useState(false);
  // State now holds the full output object which includes the data URI
  const [audioResult, setAudioResult] = useState<GenerateVoiceOverAudioOutput | null>(null);
  const { toast } = useToast();

  const form = useForm<VoiceOverFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      articleText: initialArticleText,
    },
  });

  // Update form value if the initial text prop changes
  useEffect(() => {
    if (initialArticleText) {
      form.setValue('articleText', initialArticleText);
      setAudioResult(null); // Reset audio result when text changes
    }
  }, [initialArticleText, form]);


  const onSubmit = async (values: VoiceOverFormValues) => {
    setIsLoading(true);
    setAudioResult(null);
    toast({
        title: "Generating Voice-Over",
        description: "Calling the TTS model. This may take a few moments...",
      });

    try {
      const result = await generateVoiceOverAudio(values);
      setAudioResult(result); // Store the result containing the data URI

      toast({
        title: "Voice-Over Generated",
        description: "Successfully generated the voice-over audio.",
      });
    } catch (error) {
      console.error("Error generating voice-over:", error);
       const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: `Could not generate the voice-over audio: ${errorMessage}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
     <Card>
        <CardHeader>
            <CardTitle>Voice-Over Generator</CardTitle>
            <CardDescription>Generate voice-over audio from the formatted article text using Edge-TTS.</CardDescription>
        </CardHeader>
        <CardContent>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                    control={form.control}
                    name="articleText"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Article Text (Voice-Over Script)</FormLabel>
                        <FormControl>
                        <Textarea
                            placeholder="The generated article script will appear here..."
                            {...field}
                            className="min-h-[250px]"
                            />
                        </FormControl>
                        <FormDescription>
                         The complete text formatted for voice-over. Review and edit if needed before generating audio.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <Button type="submit" disabled={isLoading || !form.getValues('articleText')}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Generate Voice-Over Audio
                </Button>
                </form>
            </Form>

             {audioResult && audioResult.audioDataUri && (
                <div className="mt-6 pt-6 border-t space-y-4">
                    <h3 className="text-lg font-semibold mb-2">Generated Audio:</h3>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-secondary rounded-md">
                        <PlayCircle className="h-8 w-8 text-primary flex-shrink-0" />
                        <audio controls className="w-full" key={audioResult.audioDataUri}>
                            <source src={audioResult.audioDataUri} type={audioResult.audioDataUri.split(':')[1].split(';')[0] || 'audio/mpeg'} />
                            Your browser does not support the audio element.
                        </audio>
                         {/* Download Button */}
                        <Button
                            variant="outline"
                            size="icon"
                            asChild // Use asChild to make the button behave like a link
                             className="flex-shrink-0"
                         >
                            <a
                                href={audioResult.audioDataUri}
                                download="voice_over.mp3" // Suggest a filename
                            >
                                <Download className="h-4 w-4" />
                                <span className="sr-only">Download Audio</span>
                            </a>
                        </Button>
                    </div>
                </div>
            )}
        </CardContent>
    </Card>
  );
};

export default VoiceOverGenerator;

