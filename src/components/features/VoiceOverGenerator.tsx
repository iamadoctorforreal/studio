
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

// Updated import for Google TTS voice list
import { getGoogleTTSVoiceList } from '@/ai/flows/generate-voice-over-audio'; 
import type { protos } from '@google-cloud/text-to-speech'; // For Google voice type

// TODO: Update default voice and form schema for Google TTS
const DEFAULT_VOICE_ID_PLACEHOLDER = 'en-US-Standard-C'; // Placeholder, will be Google Voice Name
const DEFAULT_LANGUAGE_CODE_PLACEHOLDER = 'en-US';

// TODO: This schema needs to be updated to reflect Google TTS voice parameters (e.g., voiceName, languageCode)
// For now, it will send the old voiceId, and the backend will use a default Google voice.
const formSchema = z.object({
  articleText: z.string()
    .min(1, {
        message: "Article text cannot be empty.",
     })
    .max(100000, { 
        message: "Article text is very long (max 100,000 chars recommended)."
    }),
  // This 'voiceId' will be the Google Voice Name eventually.
  // The backend GenerateVoiceOverAudioInputSchema now expects 'voiceName' and 'languageCode'.
  voiceId: z.string().min(1, "Voice selection cannot be empty.").default(DEFAULT_VOICE_ID_PLACEHOLDER),
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
      voiceId: DEFAULT_VOICE_ID_PLACEHOLDER, // Use the new placeholder
    },
  });

   // UseEffect to reset form and audio when component mounts or initial text changes drastically
    useEffect(() => {
      console.log("VoiceOverGenerator mounted or initialArticleText changed:", initialArticleText.substring(0, 50) + "..."); // Updated log
      form.reset({
          articleText: initialArticleText || "",
          voiceId: form.getValues('voiceId') || DEFAULT_VOICE_ID_PLACEHOLDER // Use the new placeholder
      });
      setAudioResult(null); // Reset audio result when text changes
      // Trigger validation after reset if needed
      form.trigger('articleText');
    }, [initialArticleText, form]);
    

    useEffect(() => {
      async function fetchVoices() {
        try {
          // TODO: Adapt to Google TTS voice structure for the dropdown
          // For now, this will fetch Google voices but the mapping to voiceOptions (string[]) will be basic.
          // The actual Google voice objects are richer (name, languageCodes, ssmlGender).
          const googleVoices: protos.google.cloud.texttospeech.v1.IVoice[] = await getGoogleTTSVoiceList(DEFAULT_LANGUAGE_CODE_PLACEHOLDER);
          // Temporary mapping: just use voice names for now. UI will need proper update.
          const voiceDisplayNames = googleVoices
            .filter(v => v.name) // Ensure voice name exists
            .map((v) => v.name as string); 
          setVoiceOptions(voiceDisplayNames);
          if (voiceDisplayNames.length > 0 && !form.getValues('voiceId')) {
            // If current voiceId is default placeholder and we have new options, update to first available
             form.setValue('voiceId', voiceDisplayNames[0]);
          } else if (voiceDisplayNames.length === 0) {
            setVoiceOptions([DEFAULT_VOICE_ID_PLACEHOLDER]); // Fallback if no voices loaded
          }
        } catch (error) {
          console.error("Failed to load Google TTS voices:", error);
          setVoiceOptions([DEFAULT_VOICE_ID_PLACEHOLDER]); // Fallback
          toast({
            variant: "destructive",
            title: "Failed to Load Voices",
            description: "Could not fetch voice list from Google TTS. Using default.",
          });
        }
      }
      fetchVoices();
    }, [form, toast]);
    
    


  const onSubmit = async (values: VoiceOverFormValues) => {
    setIsLoading(true);
    setAudioResult(null);
    toast({
        title: "Generating Voice-Over",
        description: "Sending request to Google Cloud TTS...", // Updated description
        duration: 5000,
      });

    try {
      // Construct the input for the Google TTS flow
      // The backend schema expects 'voiceName' and 'languageCode'.
      // We'll pass values.voiceId as voiceName for now. Language code can be a default or derived.
      const flowInput: GenerateVoiceOverAudioInput = {
        articleText: values.articleText,
        voiceName: values.voiceId, // Assuming voiceId from form is now the Google voice name
        languageCode: DEFAULT_LANGUAGE_CODE_PLACEHOLDER, // Or derive from selected voiceName if it contains lang code
      };
      // TODO: A more robust way to get languageCode would be from the selected voice object if UI is updated.

      console.log("Calling generateVoiceOverAudio (Google TTS) flow with input:", { ...flowInput, articleText: flowInput.articleText.substring(0,50)+'...' });

      const result = await generateVoiceOverAudio(flowInput);
      console.log("Voice-over generation result:", result);
      setAudioResult(result);

      toast({
        title: "Voice-Over Generated",
        description: "Successfully generated the voice-over audio using Google Cloud TTS.", // Updated
      });
    } catch (error: any) {
      console.error("Error generating voice-over (Google TTS):", error);
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
            <CardTitle>Voice-Over Generator (Google Cloud TTS)</CardTitle> 
            <CardDescription>Generate voice-over audio from the article text using Google Cloud Text-to-Speech.</CardDescription>
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
                            readOnly={!initialArticleText && !field.value} // Keep readOnly logic
                            className={`min-h-[250px] ${!initialArticleText && !field.value ? 'bg-muted' : 'bg-secondary/50'}`}
                            />
                        </FormControl>
                        <FormDescription>
                          Review the script. Max characters for Google TTS per request is ~5000 (bytes). This app chunks at ~4800 characters. Current total: {field.value?.length.toLocaleString() ?? 0}
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                
                {/* TODO: This voice selection needs to be fully updated for Google TTS voices */}
                {/* It currently uses voiceOptions (string[]) which is populated with Google voice names */}
                {/* but the form still submits a single 'voiceId' which is then used as 'voiceName' in backend. */}
                {/* A proper implementation would store richer voice objects and allow selection of languageCode too. */}
                <FormField
                  control={form.control}
                  name="voiceId" // This field will effectively be 'voiceName' for Google TTS
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Google TTS Voice</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a Google voice" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {voiceOptions.length === 0 && <SelectItem value="loading" disabled>Loading voices...</SelectItem>}
                          {voiceOptions.map((voiceName) => ( // voiceName is e.g., en-US-Wavenet-D
                            <SelectItem key={voiceName} value={voiceName}>
                              {voiceName} 
                              {/* TODO: Display more user-friendly name, e.g., from a mapped object */}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Select a Google Cloud TTS voice. The list is populated with available voices.
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
                     <p className="text-xs text-muted-foreground text-center">Audio generated successfully using Google Cloud TTS. Play above or download the MP3 file.</p>
                </div>
            )}
             {/* Show message if generation finished without error BUT no URI was returned */}
              {!isLoading && form.formState.isSubmitSuccessful && audioResult && !audioResult.audioDataUri && (
                <div className="mt-6 pt-6 border-t text-center">
                    <p className="text-destructive">Audio generation process completed, but no audio data URI was received. Please check console logs or try again.</p>
                </div>
             )}
             {/* Show message if generation failed and audioResult is null (error handled by toast, but this is a fallback UI state) */}
             {!isLoading && form.formState.isSubmitSuccessful && audioResult === null && (
                 <div className="mt-6 pt-6 border-t text-center">
                     <p className="text-muted-foreground">Audio generation process finished. Check notifications for status.</p>
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
