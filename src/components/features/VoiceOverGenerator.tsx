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
import { Loader2, PlayCircle, Download, Mic } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { generateVoiceOverAudio } from '@/ai/flows/generate-voice-over-audio';
import type { GenerateVoiceOverAudioOutput, GenerateVoiceOverAudioInput } from '@/ai/flows/generate-voice-over-audio';

// Updated form schema to reflect relevant Google TTS parameters (if user control is desired)
// For now, keeping it simple, voice/language controlled in the flow defaults.
const formSchema = z.object({
  articleText: z.string()
    .min(1, {
        message: "Article text cannot be empty.",
     })
    .max(100000, { // Adjusted max length based on flow comment
        message: "Article text is very long (max 100,000 chars recommended)."
    }),
  // Example: Add fields if you want user to select voice/language
  // languageCode: z.string().optional(),
  // voiceName: z.string().optional(),
});

type VoiceOverFormValues = z.infer<typeof formSchema>;

interface VoiceOverGeneratorProps {
  initialArticleText?: string;
}

const VoiceOverGenerator: React.FC<VoiceOverGeneratorProps> = ({ initialArticleText = "" }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [audioResult, setAudioResult] = useState<GenerateVoiceOverAudioOutput | null>(null);
  const { toast } = useToast();

  const form = useForm<VoiceOverFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      articleText: initialArticleText || "",
      // Set defaults if form fields are added:
      // languageCode: 'en-US',
      // voiceName: 'en-US-Standard-C',
    },
  });

   // UseEffect to reset form and audio when component mounts or initial text changes drastically
    useEffect(() => {
      console.log("VoiceOverGenerator mounted or initialArticleText changed:", initialArticleText.substring(0, 50) + "...");
      form.reset({ articleText: initialArticleText || "" }); // Reset form with new initial text
      setAudioResult(null); // Reset audio result when text changes
      // Trigger validation after reset if needed
      form.trigger('articleText');
    }, [initialArticleText, form]);


  const onSubmit = async (values: VoiceOverFormValues) => {
    setIsLoading(true);
    setAudioResult(null);
    toast({
        title: "Generating Voice-Over",
        description: "Sending request to Google Cloud Text-to-Speech...",
        duration: 5000,
      });

    try {
      // Construct the input for the Google Cloud TTS flow
      // Uses defaults from the flow unless form controls are added
      const flowInput: GenerateVoiceOverAudioInput = {
        articleText: values.articleText,
        // Pass user-selected values if form fields exist:
        // languageCode: values.languageCode,
        // voiceName: values.voiceName,
      };

      console.log("Calling generateVoiceOverAudio (Google Cloud TTS) flow with input:", { ...flowInput, articleText: flowInput.articleText.substring(0,50)+'...' });

      const result = await generateVoiceOverAudio(flowInput);
      setAudioResult(result);

      toast({
        title: "Voice-Over Generated",
        description: "Successfully generated the voice-over audio using Google Cloud TTS.",
      });
    } catch (error: any) {
      console.error("Error generating voice-over (Google Cloud TTS):", error);
       const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred during voice-over generation.";
      toast({
        variant: "destructive",
        title: "Voice-Over Generation Failed",
        description: errorMessage,
        duration: 15000,
      });
    } finally {
      setIsLoading(false);
    }
  };

   // Function to determine the audio MIME type from data URI
   const getAudioMimeType = (dataUri: string | undefined): string => {
        if (!dataUri) return 'audio/mpeg'; // Default fallback
        try {
            const match = dataUri.match(/^data:(audio\/[^;]+);base64,/);
            if (match && match[1]) {
                return match[1];
            }
            console.warn("Could not parse MIME type from data URI, using default 'audio/mpeg'. URI start:", dataUri.substring(0, 30));
            return 'audio/mpeg';
        } catch (e) {
             console.warn("Error parsing MIME type from data URI, using default 'audio/mpeg'.", e);
            return 'audio/mpeg';
        }
    };


  return (
     <Card>
        <CardHeader>
            <CardTitle>Voice-Over Generator (Google Cloud TTS)</CardTitle>
            <CardDescription>Generate voice-over audio from the article text using the Google Cloud Text-to-Speech API.</CardDescription>
        </CardHeader>
        <CardContent>
             {!form.getValues('articleText') && !initialArticleText && (
                <p className="text-muted-foreground p-4 border rounded-md text-center">
                    Please generate article sections first. The formatted script will appear here once ready.
                </p>
             )}
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
                            placeholder="The formatted voice-over script will appear here once the article sections are generated..."
                            {...field}
                            readOnly={!initialArticleText && !field.value}
                            className={`min-h-[250px] ${!initialArticleText && !field.value ? 'bg-muted' : 'bg-secondary/50'}`}
                            />
                        </FormControl>
                        <FormDescription>
                          Review the script. Max {formSchema.shape.articleText._def.checks.find(c => c.kind === 'max')?.value.toLocaleString()} characters recommended. Current: {field.value?.length.toLocaleString() ?? 0}
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                 {/* Optional: Add UI fields for languageCode, voiceName here if needed */}

                <Button
                     type="submit"
                      disabled={isLoading || !form.formState.isValid || !form.getValues('articleText')}
                     aria-label={isLoading ? "Generating audio, please wait" : "Generate Voice Over Audio"}
                 >
                    {isLoading ? (
                         <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                     ) : (
                        <Mic className="mr-2 h-4 w-4" />
                    )}
                    {isLoading ? 'Generating Audio...' : 'Generate Voice-Over Audio'}
                </Button>
                </form>
            </Form>

             {/* Display Audio Player and Download Button */}
             {audioResult && audioResult.audioDataUri && (
                <div className="mt-6 pt-6 border-t space-y-4">
                    <h3 className="text-lg font-semibold mb-2">Generated Audio:</h3>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-secondary rounded-md border">
                        <PlayCircle className="h-8 w-8 text-primary flex-shrink-0 mt-1 sm:mt-0" aria-hidden="true" />
                        <audio controls className="w-full" key={audioResult.audioDataUri} aria-label="Generated voice over audio player">
                            <source src={audioResult.audioDataUri} type={getAudioMimeType(audioResult.audioDataUri)} />
                             Your browser does not support the audio element. Please use the download button.
                        </audio>
                        <Button
                            variant="outline"
                            size="icon"
                            asChild
                             className="flex-shrink-0"
                            aria-label="Download generated audio"
                         >
                            <a
                                href={audioResult.audioDataUri}
                                download={`news_automator_voice_${form.getValues('articleText')?.substring(0,10).replace(/\s+/g, '_') || 'audio'}_${Date.now()}.mp3`}
                            >
                                <Download className="h-4 w-4" />
                            </a>
                        </Button>
                    </div>
                     <p className="text-xs text-muted-foreground text-center">Audio generated successfully. Play above or download the MP3 file.</p>
                </div>
            )}
             {/* Show message if generation finished without error BUT no URI was returned */}
            { !isLoading && audioResult === null && form.formState.isSubmitSuccessful && (
                <div className="mt-6 pt-6 border-t text-center">
                    <p className="text-destructive">Audio generation process completed, but no audio data was received. Please check console logs or try again.</p>
                 </div>
            )}
             {/* Show message while loading */}
             {isLoading && (
                 <div className="mt-6 pt-6 border-t text-center flex items-center justify-center gap-2 text-muted-foreground">
                     <Loader2 className="h-5 w-5 animate-spin" />
                     <span>Processing audio request with Google Cloud TTS...</span>
                 </div>
             )}
        </CardContent>
    </Card>
  );
};

export default VoiceOverGenerator;
