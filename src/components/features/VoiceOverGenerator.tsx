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
import { Loader2, PlayCircle, Download, Mic, ChevronRight } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { useRouter } from 'next/navigation';
import { useVideoWorkflow } from '@/contexts/VideoWorkflowContext';
import { generateVoiceOverAudio } from '@/ai/flows/generate-voice-over-audio';
import type { GenerateVoiceOverAudioOutput, GenerateVoiceOverAudioInput } from '@/ai/flows/generate-voice-over-audio';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { getGoogleTTSVoiceList } from '@/ai/flows/generate-voice-over-audio'; 
import type { protos } from '@google-cloud/text-to-speech';

const DEFAULT_VOICE_ID_PLACEHOLDER = 'en-US-Standard-C';
const DEFAULT_LANGUAGE_CODE_PLACEHOLDER = 'en-US';

const formSchema = z.object({
  articleText: z.string()
    .min(1, {
        message: "Article text cannot be empty.",
     })
    .max(100000, { 
        message: "Article text is very long (max 100,000 chars recommended)."
    }),
  voiceId: z.string().min(1, "Voice selection cannot be empty.").default(DEFAULT_VOICE_ID_PLACEHOLDER),
});

type VoiceOverFormValues = z.infer<typeof formSchema>;

interface VoiceOverGeneratorProps {
  initialArticleText?: string;
}

interface AudioResult {
  audioUri: string;
  duration: number;
}

const VoiceOverGenerator: React.FC<VoiceOverGeneratorProps> = ({ initialArticleText = "" }) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [audioResult, setAudioResult] = useState<AudioResult | null>(null);
  const [voiceOptions, setVoiceOptions] = useState<string[]>([]);
  const { toast } = useToast();
  const router = useRouter();
  const { setGeneratedAudio } = useVideoWorkflow();

  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [demoAudioUri, setDemoAudioUri] = useState<string | null>(null);
  const demoAudioRef = React.useRef<HTMLAudioElement>(null);

  const form = useForm<VoiceOverFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      articleText: initialArticleText || "",
      voiceId: DEFAULT_VOICE_ID_PLACEHOLDER,
    },
  });

  useEffect(() => {
    console.log("VoiceOverGenerator mounted or initialArticleText changed:", initialArticleText.substring(0, 50) + "...");
    form.reset({
        articleText: initialArticleText || "",
        voiceId: form.getValues('voiceId') || DEFAULT_VOICE_ID_PLACEHOLDER
    });
    setAudioResult(null);
    form.trigger('articleText');
  }, [initialArticleText, form]);
    
  useEffect(() => {
    async function fetchVoices() {
      try {
        const [usVoicesResponse, ngVoicesResponse, gbVoicesResponse] = await Promise.all([
          getGoogleTTSVoiceList('en-US').catch(e => { console.error("Failed to load en-US voices:", e); return []; }),
          getGoogleTTSVoiceList('en-NG').catch(e => { console.error("Failed to load en-NG voices:", e); return []; }),
          getGoogleTTSVoiceList('en-GB').catch(e => { console.error("Failed to load en-GB voices:", e); return []; })
        ]);
        
        console.log(`Fetched en-US voices: ${usVoicesResponse?.length || 0}`, usVoicesResponse?.map(v => v.name));
        console.log(`Fetched en-NG voices: ${ngVoicesResponse?.length || 0}`, ngVoicesResponse?.map(v => v.name));
        console.log(`Fetched en-GB voices: ${gbVoicesResponse?.length || 0}`, gbVoicesResponse?.map(v => v.name));

        const allFetchedVoices: protos.google.cloud.texttospeech.v1.IVoice[] = [
          ...(Array.isArray(usVoicesResponse) ? usVoicesResponse : []),
          ...(Array.isArray(ngVoicesResponse) ? ngVoicesResponse : []),
          ...(Array.isArray(gbVoicesResponse) ? gbVoicesResponse : [])
        ];
        
        const standardVoices = allFetchedVoices.filter(v => v.name && v.name.includes('-Standard-'));
        console.log("Filtered Standard voices (names only):", JSON.stringify(standardVoices.map(v => v.name), null, 2));

        const voiceDisplayNames = standardVoices
          .filter(v => v.name) 
          .map((v) => v.name as string);
        
        const uniqueVoiceDisplayNames = Array.from(new Set(voiceDisplayNames));
        setVoiceOptions(uniqueVoiceDisplayNames);

        if (uniqueVoiceDisplayNames.length > 0) {
          const currentVoiceId = form.getValues('voiceId');
          if (currentVoiceId === DEFAULT_VOICE_ID_PLACEHOLDER || 
              !uniqueVoiceDisplayNames.includes(currentVoiceId) ||
              (voiceOptions.length === 1 && voiceOptions[0] === DEFAULT_VOICE_ID_PLACEHOLDER)) {
            form.setValue('voiceId', uniqueVoiceDisplayNames[0]);
          }
        } else {
          console.warn("No Standard Google TTS voices found for en-US, en-NG, or en-GB after filtering. Check API response and filter logic. All fetched voices count:", allFetchedVoices.length);
          setVoiceOptions([DEFAULT_VOICE_ID_PLACEHOLDER]); 
          form.setValue('voiceId', DEFAULT_VOICE_ID_PLACEHOLDER);
        }
      } catch (error) {
        console.error("General error in fetchVoices function:", error);
        setVoiceOptions([DEFAULT_VOICE_ID_PLACEHOLDER]);
        toast({
          variant: "destructive",
          title: "Failed to Load Voices",
          description: "Could not fetch voice list from Google TTS. Using default.",
        });
      }
    }
    fetchVoices();
  }, [form, toast]);

  const handleDemoVoice = async () => {
    const selectedVoiceName = form.getValues('voiceId');
    if (!selectedVoiceName || selectedVoiceName === 'loading') {
      toast({ title: "Select a Voice", description: "Please select a voice to demo.", variant: "destructive" });
      return;
    }

    setIsDemoLoading(true);
    setDemoAudioUri(null);
    toast({ title: "Generating Demo", description: `Fetching demo for ${selectedVoiceName}...` });

    const sampleText = "Hello, this is a demonstration of the selected voice quality.";
    const langCodeMatch = selectedVoiceName.match(/^([a-z]{2}-[A-Z]{2,3})/);
    const languageCodeForDemo = langCodeMatch ? langCodeMatch[1] : DEFAULT_LANGUAGE_CODE_PLACEHOLDER;

    const demoInput: GenerateVoiceOverAudioInput = {
      articleText: sampleText,
      voiceName: selectedVoiceName,
      languageCode: languageCodeForDemo,
    };

    try {
      const result = await generateVoiceOverAudio(demoInput);
      if (result.audioDataUri) {
        setDemoAudioUri(result.audioDataUri);
        if (demoAudioRef.current) {
            demoAudioRef.current.src = result.audioDataUri;
            demoAudioRef.current.play().catch(e => console.error("Error playing demo audio:", e));
        }
        toast({ title: "Demo Ready", description: "Playing voice demo." });
      } else {
        throw new Error("No audio data received for demo.");
      }
    } catch (error: any) {
      console.error("Error generating voice demo:", error);
      toast({
        variant: "destructive",
        title: "Demo Failed",
        description: error.message || "Could not generate voice demo.",
      });
    } finally {
      setIsDemoLoading(false);
    }
  };
    
  const onSubmit = async (values: VoiceOverFormValues) => {
    setIsLoading(true);
    setAudioResult(null);
    setDemoAudioUri(null);
    toast({
        title: "Generating Voice-Over",
        description: "Sending request to Google Cloud TTS...",
        duration: 5000,
      });

    try {
      const flowInput: GenerateVoiceOverAudioInput = {
        articleText: values.articleText,
        voiceName: values.voiceId,
        languageCode: DEFAULT_LANGUAGE_CODE_PLACEHOLDER,
      };

      console.log("Calling generateVoiceOverAudio (Google TTS) flow with input:", { ...flowInput, articleText: flowInput.articleText.substring(0,50)+'...' });

      const result = await generateVoiceOverAudio(flowInput);
      console.log("Voice-over generation result:", result);
      setAudioResult({
        audioUri: result.audioDataUri,
        duration: 0
      });

      if (result.audioDataUri && result.fileName) {
        try {
          const response = await fetch(result.audioDataUri);
          const blob = await response.blob();
          const audioFile = new File([blob], result.fileName, { type: blob.type || 'audio/mpeg' });
          
          setGeneratedAudio({
            file: audioFile,
            fileName: result.fileName,
            fileUrl: result.audioDataUri,
          });
          toast({
            title: "Voice-Over Generated & Ready",
            description: "Audio ready for SRT generation. You can proceed to the SRT Chunker.",
          });
        } catch (fetchError) {
          console.error("Error creating File object from data URI:", fetchError);
          toast({
            title: "Voice-Over Generated (with warning)",
            description: "Audio generated, but failed to prepare it for SRT chunker. Please download and upload manually if needed.",
            variant: "destructive"
          });
        }
      } else {
        toast({
          title: "Voice-Over Generated",
          description: "Successfully generated the voice-over audio using Google Cloud TTS.",
        });
      }
    } catch (error: any) {
      console.error("Error generating voice-over (Google TTS):", error);
       const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred during voice-over generation.";
      toast({
        variant: "destructive",
        title: "Voice-Over Generation Failed",
        description: errorMessage.includes("setup issue")
            ? `Setup Error: ${errorMessage}`
            : errorMessage,
        duration: 15000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getAudioMimeType = (dataUri: string | undefined): string => {
        if (!dataUri) return 'audio/mpeg';
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
                            readOnly={!initialArticleText && !field.value}
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
                
                <FormField
                  control={form.control}
                  name="voiceId" 
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Google TTS Voice (Standard)</FormLabel>
                      <div className="flex items-center gap-2">
                        <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="flex-grow">
                              <SelectValue placeholder="Select a Google Standard voice" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {voiceOptions.length === 0 && <SelectItem value="loading" disabled>Loading voices...</SelectItem>}
                            {voiceOptions.map((voiceName) => (
                              <SelectItem key={voiceName} value={voiceName}>
                                {voiceName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" onClick={handleDemoVoice} disabled={isDemoLoading || !field.value || field.value === 'loading'} variant="outline" size="sm">
                          {isDemoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                          <span className="ml-2 sm:hidden md:inline">Demo</span>
                        </Button>
                      </div>
                      <FormDescription>
                        Select a Google Cloud TTS Standard voice. Click demo to hear a sample.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <audio ref={demoAudioRef} style={{ display: 'none' }} />

                <Button
                     type="submit"
                      disabled={isLoading || isDemoLoading || !form.formState.isValid || !form.getValues('articleText')}
                     aria-label={isLoading ? "Generating full audio, please wait" : "Generate Full Voice Over"}
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

             {audioResult && audioResult.audioUri && (
                <div className="mt-6 pt-6 border-t space-y-4">
                    <h3 className="text-lg font-semibold mb-2">Generated Audio:</h3>
                    <div className="p-4 bg-secondary rounded-md border space-y-3">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                            <PlayCircle className="h-8 w-8 text-primary flex-shrink-0 mt-1 sm:mt-0" aria-hidden="true" />
                            <audio controls className="w-full" key={audioResult.audioUri} aria-label="Generated voice over audio player">
                                <source src={audioResult.audioUri} type={getAudioMimeType(audioResult.audioUri)} />
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
                                    href={audioResult.audioUri}
                                    download={`voice_over_${Date.now()}.mp3`}
                                >
                                    <Download className="h-4 w-4" />
                                </a>
                            </Button>
                        </div>
                        <Button 
                            onClick={() => router.push('/srt-chunker')} 
                            variant="default" 
                            className="w-full sm:w-auto"
                            aria-label="Proceed to SRT Chunker with this audio"
                        >
                            Proceed to SRT Chunker <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                    </div>
                     <p className="text-xs text-muted-foreground text-center mt-2">Audio generated successfully. You can now proceed to the SRT Chunker.</p>
                </div>
            )}
             {!isLoading && form.formState.isSubmitSuccessful && audioResult && !audioResult.audioUri && (
                <div className="mt-6 pt-6 border-t text-center">
                    <p className="text-destructive">Audio generation process completed, but no audio data URI was received. Please check console logs or try again.</p>
                </div>
             )}
             {!isLoading && form.formState.isSubmitSuccessful && audioResult === null && (
                 <div className="mt-6 pt-6 border-t text-center">
                     <p className="text-muted-foreground">Audio generation process finished. Check notifications for status.</p>
                 </div>
             )}

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