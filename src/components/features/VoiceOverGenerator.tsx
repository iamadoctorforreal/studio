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
import { Loader2, PlayCircle, Download, Mic } from 'lucide-react'; // Added Mic
import { useToast } from "@/hooks/use-toast";
import { generateVoiceOverAudio } from '@/ai/flows/generate-voice-over-audio';
import type { GenerateVoiceOverAudioOutput } from '@/ai/flows/generate-voice-over-audio';

const formSchema = z.object({
  articleText: z.string().min(20, { // Reduced min length slightly
    message: "Article text must be at least 20 characters.",
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
      articleText: initialArticleText || "", // Ensure default is string
    },
  });

  // Update form value if the initial text prop changes
  useEffect(() => {
    // Only update if the prop has a value and it's different from current form value
    if (initialArticleText && initialArticleText !== form.getValues('articleText')) {
        console.log("Updating voice over text from prop.");
        form.setValue('articleText', initialArticleText, { shouldValidate: true }); // Validate on update
        setAudioResult(null); // Reset audio result when text changes
    }
   }, [initialArticleText, form]); // form added as dependency


  const onSubmit = async (values: VoiceOverFormValues) => {
    setIsLoading(true);
    setAudioResult(null);
    toast({
        title: "Generating Voice-Over",
        description: "Calling the TTS model. This may take a moment...",
      });

    try {
      // Ensure the input matches the flow's expected structure
      const result = await generateVoiceOverAudio({ articleText: values.articleText });
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
        duration: 9000, // Show error longer
      });
    } finally {
      setIsLoading(false);
    }
  };

   // Function to determine the audio MIME type from data URI
   const getAudioMimeType = (dataUri: string | undefined): string => {
        if (!dataUri) return 'audio/mpeg'; // Default fallback
        try {
            return dataUri.substring(dataUri.indexOf(':') + 1, dataUri.indexOf(';'));
        } catch (e) {
             console.warn("Could not parse MIME type from data URI, using default.", e);
            return 'audio/mpeg';
        }
    };


  return (
     <Card>
        <CardHeader>
            <CardTitle>Voice-Over Generator</CardTitle>
            <CardDescription>Generate voice-over audio from the formatted article text using a Text-to-Speech model.</CardDescription>
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
                            placeholder="The formatted voice-over script will appear here once the article sections are generated and formatted..."
                            {...field}
                            className="min-h-[250px] bg-secondary/50" // Slightly different bg
                             readOnly={!initialArticleText} // Make read-only if no initial text provided
                            />
                        </FormControl>
                        <FormDescription>
                          Review and edit the script if needed before generating the audio.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <Button
                     type="submit"
                     disabled={isLoading || !form.formState.isValid || !form.getValues('articleText')} // Disable if loading, invalid, or empty
                     aria-label="Generate Voice Over Audio"
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
                            {/* Dynamically set type based on data URI */}
                            <source src={audioResult.audioDataUri} type={getAudioMimeType(audioResult.audioDataUri)} />
                             Your browser does not support the audio element. Please use the download button.
                        </audio>
                         {/* Download Button */}
                        <Button
                            variant="outline"
                            size="icon"
                            asChild // Use asChild to make the button behave like a link
                             className="flex-shrink-0"
                            aria-label="Download generated audio"
                         >
                            <a
                                href={audioResult.audioDataUri}
                                download={`news_automator_voice_over_${Date.now()}.mp3`} // Suggest a filename with timestamp
                            >
                                <Download className="h-4 w-4" />
                                {/* Screen reader only text */}
                                {/* <span className="sr-only">Download Audio</span> */}
                            </a>
                        </Button>
                    </div>
                     <p className="text-xs text-muted-foreground text-center">Audio generated successfully. You can play it above or download the file.</p>
                </div>
            )}
             {/* Optional: Show message if generation is done but failed silently (no URI) */}
            { !isLoading && audioResult && !audioResult.audioDataUri && (
                <div className="mt-6 pt-6 border-t text-center">
                    <p className="text-destructive">Audio generation finished, but no audio data was received. Please check the logs or try again.</p>
                 </div>
            )}
        </CardContent>
    </Card>
  );
};

export default VoiceOverGenerator;