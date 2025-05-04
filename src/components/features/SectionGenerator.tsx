'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowRight, Mic, Play, Square, Timer } from 'lucide-react'; // Added Timer icon
import { useToast } from "@/hooks/use-toast";
import { generateSingleArticleSection } from '@/ai/flows/generate-article-section';
import type { GenerateSingleArticleSectionOutput } from '@/ai/flows/generate-article-section';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from "@/components/ui/progress";

// Helper to parse outline
const parseOutline = (outline: string): string[] => {
  if (!outline) return [];
  return outline
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => line.replace(/^(?:\d+\.|-|\*)\s*/, ''))
    .filter(line => line.length > 0);
};

interface SectionGeneratorProps {
  articleTitle: string;
  articleOutline: string;
  focusKeyPhrase: string;
  onProceedToVoiceOver: (fullArticleText: string) => void;
}

type GenerationStatus = 'idle' | 'generating_first' | 'generating_subsequent' | 'delaying' | 'complete' | 'error';

// Delay between automatic section generations (in milliseconds) to avoid rate limits
const GENERATION_DELAY_MS = 5000; // 5 seconds

const SectionGenerator: React.FC<SectionGeneratorProps> = ({
  articleTitle,
  articleOutline,
  focusKeyPhrase,
  onProceedToVoiceOver
}) => {
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [generatedSections, setGeneratedSections] = useState<Record<string, string>>({});
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number>(0); // Index of the section currently being generated or next to generate
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0); // Progress state
  const { toast } = useToast();
  const isGeneratingRef = useRef(false); // Ref to prevent duplicate triggers
  const delayTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref for the delay timeout

  const outlineSections = useMemo(() => parseOutline(articleOutline), [articleOutline]);
  const totalSections = outlineSections.length;

  // Calculate combined content whenever generatedSections or outlineSections change
  const fullArticleText = useMemo(() => {
      return outlineSections
        .map(topic => generatedSections[topic] || "") // Get content or empty string
        .filter(Boolean) // Remove empty strings in case some sections failed but others succeeded
        .join('\n\n---\n\n'); // Join with a separator
  }, [generatedSections, outlineSections]);


  // Effect to update progress bar
  useEffect(() => {
     if (totalSections > 0) {
         const generatedCount = Object.keys(generatedSections).length;
         setProgress((generatedCount / totalSections) * 100);
     } else {
        setProgress(0);
     }
  }, [generatedSections, totalSections]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
        if (delayTimeoutRef.current) {
            clearTimeout(delayTimeoutRef.current);
        }
    };
  }, []);


  // The core generation logic loop
  const generateSection = useCallback(async (index: number) => {
    if (index >= totalSections || !outlineSections[index]) {
        console.log("Attempted to generate section beyond outline bounds.");
        isGeneratingRef.current = false; // Ensure flag is reset
        setStatus('complete'); // Or error if appropriate, but complete if just ran out of sections
        return;
    }

    const sectionTopic = outlineSections[index];
    console.log(`Attempting generation for index ${index}, topic: "${sectionTopic}"`);
    setErrorMsg(null); // Clear previous error

    const isFirst = index === 0;
    setStatus(isFirst ? 'generating_first' : 'generating_subsequent');

    try {
      const previousContent = outlineSections
        .slice(0, index)
        .map(topic => generatedSections[topic])
        .filter(Boolean)
        .join('\n\n---\n\n');

      // Input for the AI flow (displayIndex is calculated within the flow wrapper now)
      const input = {
        title: articleTitle,
        focusKeyPhrase: focusKeyPhrase,
        sectionTopic: sectionTopic,
        sectionIndex: index,
        totalSections: totalSections,
        previousSectionsContent: previousContent || undefined,
        isFirstSection: isFirst,
      };
      console.log("Generating section with input:", {...input, previousSectionsContent: input.previousSectionsContent ? '...' : undefined }); // Log sanitized input

      const result: GenerateSingleArticleSectionOutput = await generateSingleArticleSection(input);

      // Update state IMMUTABLY
      setGeneratedSections(prev => ({
        ...prev,
        [sectionTopic]: result.sectionContent
      }));

      setCurrentSectionIndex(index + 1); // Move to next index

      toast({
        title: `Section ${index + 1}/${totalSections} Generated`,
        description: `Content for "${sectionTopic}" created.`,
      });

      // Check if this was the last section
      if (index + 1 >= totalSections) {
          console.log("All sections generated.");
          setStatus('complete');
          isGeneratingRef.current = false; // Allow next action
           toast({ title: "Article Complete!", description: "All sections generated successfully." });
      } else {
           // Automatically trigger the next section generation AFTER A DELAY
           setStatus('delaying'); // Set status to indicate delay
           console.log(`Delaying for ${GENERATION_DELAY_MS / 1000}s before generating section ${index + 2}`);
           delayTimeoutRef.current = setTimeout(() => {
                if (isGeneratingRef.current) { // Check if still supposed to be generating
                    generateSection(index + 1);
                } else {
                    console.log("Generation stopped during delay.");
                    setStatus('idle'); // Or 'error' if stopped due to error previously
                }
           }, GENERATION_DELAY_MS);
      }

    } catch (error) {
      console.error(`Error generating section ${index + 1} ("${sectionTopic}"):`, error);
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      // Check for rate limit specific error message
       let userFriendlyMessage = `Failed on section ${index + 1} ("${sectionTopic}"): ${message}`;
       if (message.includes('429') || message.toLowerCase().includes('too many requests') || message.toLowerCase().includes('quota exceeded')) {
           userFriendlyMessage = `API Rate Limit Reached (Section ${index + 1}). Please wait a minute and try again. Consider increasing the delay between generations if this persists. Original error: ${message}`;
       }
      setErrorMsg(userFriendlyMessage);
      setStatus('error');
      isGeneratingRef.current = false; // Stop generation on error
      if (delayTimeoutRef.current) {
          clearTimeout(delayTimeoutRef.current); // Clear any pending delay timeout
          delayTimeoutRef.current = null;
      }
      toast({
        variant: "destructive",
        title: `Generation Failed (Section ${index + 1})`,
        description: userFriendlyMessage, // Use the potentially more helpful message
        duration: 15000, // Show longer
      });
    }
  }, [totalSections, outlineSections, articleTitle, focusKeyPhrase, generatedSections, toast]);


  // Starts the automatic generation process
  const startGeneration = () => {
      if (isGeneratingRef.current || status === 'generating_first' || status === 'generating_subsequent' || status === 'delaying' || totalSections === 0) {
          console.log("Generation already in progress, completed, delaying, or no sections.");
          return;
      }
      console.log("Starting generation process...");
      isGeneratingRef.current = true; // Set flag
      setGeneratedSections({}); // Reset previous results
      setCurrentSectionIndex(0); // Start from the beginning
      setErrorMsg(null); // Clear any previous error message
      if (delayTimeoutRef.current) { // Clear any residual timeout
          clearTimeout(delayTimeoutRef.current);
          delayTimeoutRef.current = null;
      }
      generateSection(0); // Trigger the first section generation
  };

  // Stop the generation process
  const stopGeneration = () => {
     console.log("Stopping generation process...");
     isGeneratingRef.current = false;
     if (delayTimeoutRef.current) {
         clearTimeout(delayTimeoutRef.current);
         delayTimeoutRef.current = null;
     }
     // Set status based on whether it was generating/delaying or already finished/errored
     if (status === 'generating_first' || status === 'generating_subsequent' || status === 'delaying') {
         setStatus('idle'); // Or maybe a specific 'stopped' state if needed
         toast({ title: "Generation Stopped", description: "Article generation paused." });
     }
  };


  // Function called when the "Format for Voice Over" button is clicked
  const handleProceedToVoiceOverClick = () => {
    if (status !== 'complete') {
         toast({ variant: "destructive", title: "Incomplete Article", description: "Please wait for all sections to be generated first." });
         return;
    }
     if (isGeneratingRef.current) {
         toast({ variant: "destructive", title: "Generation in Progress", description: "Cannot proceed while generation is active." });
         return;
     }
    console.log("Proceeding to Voice Over. Full text length:", fullArticleText.length);
    onProceedToVoiceOver(fullArticleText); // Pass the combined string to the parent
  };


  // Prerequisite checks
  if (!articleTitle || !articleOutline || !focusKeyPhrase) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Article Section Generator</CardTitle>
                <CardDescription>Generate article content section by section.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">Please generate an article outline first, including a title and focus key phrase.</p>
            </CardContent>
        </Card>
    );
   }
   if (totalSections === 0 && articleOutline) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Article Section Generator</CardTitle>
                    <CardDescription>Article: <strong>{articleTitle}</strong> | Focus: <strong>{focusKeyPhrase}</strong></CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-destructive">Could not parse any sections from the provided outline. Please go back and ensure the outline is a valid list format.</p>
                </CardContent>
            </Card>
        );
    }


  // Determine Button Text and State
   let buttonText = "Start Article Generation";
   let buttonIcon = <Play className="mr-2 h-4 w-4" />;
   let isButtonDisabled = status === 'generating_first' || status === 'generating_subsequent' || status === 'delaying';
   let buttonAction = startGeneration;

    if (status === 'generating_first' || status === 'generating_subsequent') {
        buttonText = `Generating Section ${currentSectionIndex + 1}/${totalSections}...`;
        buttonIcon = <Loader2 className="mr-2 h-4 w-4 animate-spin" />;
    } else if (status === 'delaying') {
        buttonText = `Waiting for next section... (${GENERATION_DELAY_MS / 1000}s delay)`;
        buttonIcon = <Timer className="mr-2 h-4 w-4 animate-pulse" />; // Use Timer icon
    } else if (status === 'complete') {
        buttonText = "Do you want to create the voice over now?";
        buttonIcon = <Mic className="mr-2 h-4 w-4" />;
        buttonAction = handleProceedToVoiceOverClick;
        isButtonDisabled = false; // Enable button when complete
    } else if (status === 'error') {
        buttonText = "Retry Generation";
        buttonIcon = <Play className="mr-2 h-4 w-4" />;
        buttonAction = () => { // Reset state and restart
            if (isGeneratingRef.current) return; // Prevent clicks during restart
            console.log("Retrying generation...");
            isGeneratingRef.current = true;
            setStatus('idle'); // Reset status temporarily before starting
            setErrorMsg(null);
            setGeneratedSections({}); // Reset generated content on full retry
            setCurrentSectionIndex(0); // Reset index on full retry
            if (delayTimeoutRef.current) { // Clear any residual timeout
                clearTimeout(delayTimeoutRef.current);
                delayTimeoutRef.current = null;
            }
            // Start generation again
            generateSection(0);
         };
        isButtonDisabled = false; // Enable retry button
    }


  return (
    <Card>
        <CardHeader>
            <CardTitle>Article Section Generator</CardTitle>
            <CardDescription>
               {status === 'idle' && "Ready to generate content for each section of your article outline."}
               {(status === 'generating_first' || status === 'generating_subsequent') && "Generating article content section by section automatically..."}
               {status === 'delaying' && `Waiting ${GENERATION_DELAY_MS / 1000}s before generating the next section to avoid rate limits...`}
               {status === 'complete' && "All sections generated! Ready to proceed to voice-over."}
               {status === 'error' && "An error occurred during generation. Check details below."}
            </CardDescription>
             <p className="text-sm text-muted-foreground pt-2">Article: <strong>{articleTitle}</strong> ({totalSections} sections)</p>
             <p className="text-sm text-muted-foreground">Focus: <strong>{focusKeyPhrase}</strong></p>
        </CardHeader>
        <CardContent>
             <div className="space-y-6">
                {/* Progress Bar */}
                 <Progress value={progress} className="w-full h-2" />
                 <p className="text-sm text-center text-muted-foreground">
                    {Object.keys(generatedSections).length} / {totalSections} sections generated ({Math.round(progress)}%)
                 </p>


                {/* Display Generated Sections */}
                 <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Generated Content:</h3>
                    <ScrollArea className="h-72 w-full rounded-md border p-4 bg-secondary">
                        {outlineSections.map((topic, index) => (
                            <div key={topic + index} className="mb-4 p-3 bg-card rounded shadow-sm border border-input">
                                <h4 className="font-semibold text-md mb-1">{index + 1}. {topic}</h4>
                                {generatedSections[topic] ? (
                                    <div className="whitespace-pre-wrap text-sm p-2 bg-background rounded border border-input">
                                        {generatedSections[topic]}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground italic">
                                        {status === 'generating_subsequent' && index === currentSectionIndex ? 'Generating...' : ''}
                                         {status === 'delaying' && index === currentSectionIndex ? `Waiting (${GENERATION_DELAY_MS / 1000}s)...` : ''}
                                         {(status === 'idle' || index > currentSectionIndex) && status !== 'complete' && status !== 'error' ? 'Pending...' : ''}
                                         {status === 'generating_first' && index === 0 && 'Generating...'}
                                        {status === 'error' && index === currentSectionIndex && 'Failed'}
                                        {status === 'complete' && !generatedSections[topic] && 'Not Generated (Error?)'}
                                     </p>
                                )}
                            </div>
                        ))}
                         {/* Optional: Show loading/delay indicator at the end */}
                         {(status === 'generating_first' || status === 'generating_subsequent') && currentSectionIndex < totalSections && (
                            <div className="flex items-center justify-center p-4 text-muted-foreground">
                                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                Processing section {currentSectionIndex + 1}...
                            </div>
                         )}
                         {status === 'delaying' && currentSectionIndex < totalSections && (
                             <div className="flex items-center justify-center p-4 text-muted-foreground">
                                 <Timer className="h-5 w-5 animate-pulse mr-2" />
                                 Waiting before section {currentSectionIndex + 1}...
                             </div>
                          )}
                    </ScrollArea>
                     {errorMsg && (
                        <p className="text-destructive text-sm p-2 bg-destructive/10 border border-destructive rounded whitespace-pre-wrap">{errorMsg}</p>
                     )}
                </div>

                {/* Control Buttons */}
                <div className="flex gap-4 items-center pt-4 border-t">
                    <Button onClick={buttonAction} disabled={isButtonDisabled} className={status === 'complete' ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}>
                      {buttonIcon}
                      {buttonText}
                    </Button>

                    {/* Stop button */}
                    {(status === 'generating_first' || status === 'generating_subsequent' || status === 'delaying') && (
                        <Button variant="outline" onClick={stopGeneration} disabled={!isGeneratingRef.current}>
                             <Square className="mr-2 h-4 w-4" /> Stop Generation
                        </Button>
                    )}
                 </div>
            </div>
        </CardContent>
    </Card>
  );
};

export default SectionGenerator;
