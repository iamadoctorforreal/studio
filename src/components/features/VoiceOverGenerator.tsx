
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
// Make sure the import path is correct and matches the updated flow file name/location
import { generateVoiceOverAudio } from '@/ai/flows/generate-voice-over-audio';
import type { GenerateVoiceOverAudioOutput, GenerateVoiceOverAudioInput } from '@/ai/flows/generate-voice-over-audio'; // Import input type too

// Update Zod schema to reflect the flow's input constraints (e.g., max length)
const formSchema = z.object({
  articleText: z.string()
    .min(1, { // Minimum length can be 1
        message: "Article text cannot be empty.",
     })
    .max(500000, { // Max length from UnrealSpeech docs
        message: "Article text exceeds the maximum allowed length (500,000 characters)."
    }),
  // Add optional fields from the flow input if you want to control them via UI
  // voiceId: z.string().optional(),
  // bitrate: z.string().optional(),
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
      // Initialize optional fields if added to the form
      // voiceId: 'Liv',
      // bitrate: '192k',
    },
  });

   // UseEffect to reset form and audio when component mounts or initial text changes drastically
    useEffect(() => {
      console.log("VoiceOverGenerator mounted or initialArticleText changed:", initialArticleText.substring(0, 50) + "...");
      form.reset({ articleText: initialArticleText || "" }); // Reset form with new initial text
      setAudioResult(null); // Reset audio result when text changes
      // Trigger validation after reset if needed
      form.trigger('articleText');
    }, [initialArticleText, form]); // form added as dependency


  const onSubmit = async (values: VoiceOverFormValues) => {
    setIsLoading(true);
    setAudioResult(null);
    toast({
        title: "Generating Voice-Over",
        description: "Creating UnrealSpeech synthesis task. This might take some time depending on text length...",
        duration: 10000, // Longer duration for async task
      });

    try {
      // Construct the input for the flow, including optional fields if they exist in the form
      const flowInput: GenerateVoiceOverAudioInput = {
        articleText: values.articleText,
         // Pass optional values if they are part of the form state
         // voiceId: values.voiceId || undefined, // Pass if form has voiceId field
         // bitrate: values.bitrate || undefined, // Pass if form has bitrate field
      };

      console.log("Calling generateVoiceOverAudio flow with input:", { ...flowInput, articleText: flowInput.articleText.substring(0,50)+'...' }); // Log sanitized input

      const result = await generateVoiceOverAudio(flowInput);
      setAudioResult(result); // Store the result containing the data URI

      toast({
        title: "Voice-Over Generated",
        description: "Successfully generated the voice-over audio.",
      });
    } catch (error: any) { // Catch 'any' type for flexibility
      console.error("Error generating voice-over:", error);
       // Use the error message directly if it's an Error object, otherwise provide a generic message
       const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred during voice-over generation.";
      toast({
        variant: "destructive",
        title: "Voice-Over Generation Failed",
        // Display the specific error message from the flow
        description: errorMessage,
        duration: 15000, // Show error longer
      });
    } finally {
      setIsLoading(false);
    }
  };

   // Function to determine the audio MIME type from data URI
   const getAudioMimeType = (dataUri: string | undefined): string => {
        if (!dataUri) return 'audio/mpeg'; // Default fallback
        try {
            // Robust parsing: handle potential errors if format is unexpected
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
            <CardTitle>Voice-Over Generator (UnrealSpeech)</CardTitle>
            <CardDescription>Generate voice-over audio from the article text using the UnrealSpeech API. Generation may take time for long texts.</CardDescription>
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
                             // Make read-only only if there's truly no initial text and it hasn't been populated yet
                            readOnly={!initialArticleText && !field.value}
                            className={`min-h-[250px] ${!initialArticleText && !field.value ? 'bg-muted' : 'bg-secondary/50'}`}
                            />
                        </FormControl>
                        <FormDescription>
                          Review the script. Max {formSchema.shape.articleText._def.checks.find(c => c.kind === 'max')?.value.toLocaleString()} characters. Current: {field.value?.length.toLocaleString() ?? 0}
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                 {/* Optional: Add fields for VoiceId, Bitrate here if needed */}

                <Button
                     type="submit"
                      // Disable if loading OR form is invalid OR text is empty
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
                                // Suggest a filename including voice and timestamp
                                download={`news_automator_voice_${form.getValues('articleText')?.substring(0,10).replace(/\s+/g, '_') || 'audio'}_${Date.now()}.mp3`}
                            >
                                <Download className="h-4 w-4" />
                                {/* <span className="sr-only">Download Audio</span> */}
                            </a>
                        </Button>
                    </div>
                     <p className="text-xs text-muted-foreground text-center">Audio generated successfully. Play above or download the MP3 file.</p>
                </div>
            )}
             {/* Show message if generation finished without error BUT no URI was returned (should be rare with new logic) */}
            { !isLoading && audioResult === null && form.formState.isSubmitSuccessful && (
                <div className="mt-6 pt-6 border-t text-center">
                    <p className="text-destructive">Audio generation process completed, but no audio data was received. This might indicate an issue during the final download or processing step. Please check the console logs or try again.</p>
                 </div>
            )}
             {/* Show message while loading */}
             {isLoading && (
                 <div className="mt-6 pt-6 border-t text-center flex items-center justify-center gap-2 text-muted-foreground">
                     <Loader2 className="h-5 w-5 animate-spin" />
                     <span>Processing audio request... This may take a while for long texts.</span>
                 </div>
             )}
        </CardContent>
    </Card>
  );
};

export default VoiceOverGenerator;

    