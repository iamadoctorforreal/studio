
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { getEdgeTTSVoiceList } from '@/ai/flows/generate-voice-over-audio'; // to list the voice list





// Default voice for Edge TTS
const DEFAULT_VOICE_ID = 'en-US-AriaNeural';

// Updated form schema for Edge TTS
const formSchema = z.object({
  articleText: z.string()
    .min(1, {
        message: "Article text cannot be empty.",
     })
    .max(100000, { // Max length based on flow comment
        message: "Article text is very long (max 100,000 chars recommended)."
    }),
  voiceId: z.string().min(1, "Voice ID cannot be empty.").default(DEFAULT_VOICE_ID),
});

type VoiceOverFormValues = z.infer<typeof formSchema>;

interface VoiceOverGeneratorProps {
  initialArticleText?: string;
}

const VoiceOverGenerator: React.FC<VoiceOverGeneratorProps> = ({ initialArticleText = "" }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [audioResult, setAudioResult] = useState<GenerateVoiceOverAudioOutput | null>(null);
  const [voiceOptions, setVoiceOptions] = useState<string[]>([]);
  const { toast } = useToast();

  const form = useForm<VoiceOverFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      articleText: initialArticleText || "",
      voiceId: DEFAULT_VOICE_ID, // Set default voice ID
    },
  });

   // UseEffect to reset form and audio when component mounts or initial text changes drastically
    useEffect(() => {
      console.log("VoiceOverGenerator mounted or initialArticleText changed (using Edge TTS):", initialArticleText.substring(0, 50) + "...");
      form.reset({
          articleText: initialArticleText || "",
          voiceId: form.getValues('voiceId') || DEFAULT_VOICE_ID // Keep existing voice or reset to default
      });
      setAudioResult(null); // Reset audio result when text changes
      // Trigger validation after reset if needed
      form.trigger('articleText');
    }, [initialArticleText, form]);
    

    useEffect(() => {
      async function fetchVoices() {
        try {
          const voices = await getEdgeTTSVoiceList();
          const voiceNames = voices.map((v) => v.voiceId); // assuming this is the correct field
          setVoiceOptions(voiceNames);
        } catch (error) {
          console.error("Failed to load Edge TTS voices:", error);
          setVoiceOptions([DEFAULT_VOICE_ID]); // fallback
        }
      }
      fetchVoices();
    }, []);
    
    


  const onSubmit = async (values: VoiceOverFormValues) => {
    setIsLoading(true);
    setAudioResult(null);
    toast({
        title: "Generating Voice-Over",
        description: "Sending request to local Edge TTS...",
        duration: 5000,
      });

    try {
      // Construct the input for the Edge TTS flow
      const flowInput: GenerateVoiceOverAudioInput = {
        articleText: values.articleText,
        voiceId: values.voiceId,
      };

      console.log("Calling generateVoiceOverAudio (Edge TTS) flow with input:", { ...flowInput, articleText: flowInput.articleText.substring(0,50)+'...' });

      const result = await generateVoiceOverAudio(flowInput);
      console.log("Voice-over generation result:", result);
      setAudioResult(result);

      toast({
        title: "Voice-Over Generated",
        description: "Successfully generated the voice-over audio using local Edge TTS.",
      });
    } catch (error: any) {
      console.error("Error generating voice-over (Edge TTS):", error);
       const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred during voice-over generation.";
      toast({
        variant: "destructive",
        title: "Voice-Over Generation Failed",
        // Make setup error message more prominent if detected
        description: errorMessage.includes("setup issue")
            ? `Setup Error: ${errorMessage}`
            : errorMessage,
        duration: 15000, // Show longer for errors
      });
    } finally {
      setIsLoading(false);
    }
  };

   // Function to determine the audio MIME type from data URI
   const getAudioMimeType = (dataUri: string | undefined): string => {
        if (!dataUri) return 'audio/mpeg'; // Default fallback for MP3
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
            <CardTitle>Voice-Over Generator (Local Edge TTS)</CardTitle>
            <CardDescription>Generate voice-over audio from the article text using the locally available <code className='bg-muted px-1 rounded'>@andresaya/edge-tts</code> package.</CardDescription>
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
                 {/* Voice ID Input */}

               {/*  <FormField
                    control={form.control}
                    name="voiceId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Edge TTS Voice ID</FormLabel>
                            <FormControl>
                                <Input placeholder="e.g., en-US-AriaNeural" {...field} />
                            </FormControl>
                            <FormDescription>
                                The voice model to use. Find available voices by running <code className='bg-muted px-1 rounded'>edge-tts voice-list</code> in your terminal.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                    /> */}

<FormField
  control={form.control}
  name="voiceId"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Edge TTS Voice</FormLabel>
      <Select onValueChange={field.onChange} defaultValue={field.value}>
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="Select a voice" />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {voiceOptions.map((voice) => (
            <SelectItem key={voice} value={voice}>
              {voice}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FormDescription>
        Pick from available Edge TTS voices. You can also run <code className="bg-muted px-1 rounded">edge-tts voice-list</code> in your terminal.
      </FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>


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
                     <p className="text-xs text-muted-foreground text-center">Audio generated successfully using Edge TTS. Play above or download the MP3 file.</p>
                </div>
            )}
             {/* Show message if generation finished without error BUT no URI was returned */}
           
         {/*   { !isLoading && audioResult === null && form.formState.isSubmitSuccessful && (
                <div className="mt-6 pt-6 border-t text-center">
                    <p className="text-destructive">Audio generation process completed, but no audio data was received. Please check console logs or try again.</p>
                 </div>
            )} */}

              {!isLoading && form.formState.isSubmitSuccessful && (!audioResult || !audioResult.audioDataUri) && (
                <div className="mt-6 pt-6 border-t text-center">
                    <p className="text-destructive">Audio generation completed, but no audio was returned. Please check logs or try again.</p>
                </div>
             )}


             {/* Show message while loading */}
             {isLoading && (
                 <div className="mt-6 pt-6 border-t text-center flex items-center justify-center gap-2 text-muted-foreground">
                     <Loader2 className="h-5 w-5 animate-spin" />
                     <span>Processing audio request with local Edge TTS...</span>
                 </div>
             )}
        </CardContent>
    </Card>
  );
};

export default VoiceOverGenerator;
