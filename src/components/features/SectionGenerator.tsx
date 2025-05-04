'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowRight, Mic, Play, Square } from 'lucide-react'; // Added Play/Square
import { useToast } from "@/hooks/use-toast";
import { generateSingleArticleSection } from '@/ai/flows/generate-article-section';
import type { GenerateSingleArticleSectionOutput } from '@/ai/flows/generate-article-section';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from "@/components/ui/progress"; // Import Progress

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

type GenerationStatus = 'idle' | 'generating_first' | 'generating_subsequent' | 'complete' | 'error';

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
      console.log("Generating section with input:", input);

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
           // Automatically trigger the next section generation
           // Use setTimeout to allow UI updates and prevent deep call stacks
           setTimeout(() => generateSection(index + 1), 100); // Slight delay
      }

    } catch (error) {
      console.error(`Error generating section ${index + 1} ("${sectionTopic}"):`, error);
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      setErrorMsg(`Failed on section ${index + 1} ("${sectionTopic}"): ${message}`);
      setStatus('error');
      isGeneratingRef.current = false; // Stop generation on error
      toast({
        variant: "destructive",
        title: `Generation Failed (Section ${index + 1})`,
        description: `Could not generate section "${sectionTopic}". ${message}`,
        duration: 9000, // Show longer
      });
    }
  }, [totalSections, outlineSections, articleTitle, focusKeyPhrase, generatedSections, toast]); // Removed status, added onProceedToVoiceOver


  // Starts the automatic generation process
  const startGeneration = () => {
      if (isGeneratingRef.current || status === 'generating_first' || status === 'generating_subsequent' || totalSections === 0) {
          console.log("Generation already in progress, completed, or no sections.");
          return;
      }
      console.log("Starting generation process...");
      isGeneratingRef.current = true; // Set flag
      setGeneratedSections({}); // Reset previous results
      setCurrentSectionIndex(0); // Start from the beginning
      setErrorMsg(null); // Clear any previous error message
      generateSection(0); // Trigger the first section generation
  };


  // Function called when the "Format for Voice Over" button is clicked
  const handleProceedToVoiceOverClick = () => {
    if (status !== 'complete') {
         toast({ variant: "destructive", title: "Incomplete Article", description: "Please wait for all sections to be generated first." });
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
   let isButtonDisabled = status === 'generating_first' || status === 'generating_subsequent';
   let buttonAction = startGeneration;

    if (status === 'generating_first' || status === 'generating_subsequent') {
        buttonText = `Generating Section ${currentSectionIndex + 1}/${totalSections}...`;
        buttonIcon = <Loader2 className="mr-2 h-4 w-4 animate-spin" />;
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
            // For simplicity, let's restart from the beginning.
            // Could implement resuming from the failed index if needed.
            setTimeout(() => generateSection(0), 100); // Start generation again
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
                                        {status === 'generating_subsequent' && index === currentSectionIndex ? 'Generating...' : (status === 'idle' || index > currentSectionIndex ? 'Pending...' : '')}
                                        {status === 'generating_first' && index === 0 && 'Generating...'}
                                        {status === 'error' && index === currentSectionIndex && 'Failed'}
                                     </p>
                                )}
                            </div>
                        ))}
                         {/* Optional: Show loading indicator at the end */}
                         {(status === 'generating_first' || status === 'generating_subsequent') && currentSectionIndex < totalSections && (
                            <div className="flex items-center justify-center p-4 text-muted-foreground">
                                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                Processing section {currentSectionIndex + 1}...
                            </div>
                         )}
                    </ScrollArea>
                     {errorMsg && (
                        <p className="text-destructive text-sm p-2 bg-destructive/10 border border-destructive rounded">{errorMsg}</p>
                     )}
                </div>

                {/* Control Button */}
                <div className="flex gap-4 items-center pt-4 border-t">
                    <Button onClick={buttonAction} disabled={isButtonDisabled} className={status === 'complete' ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}>
                      {buttonIcon}
                      {buttonText}
                    </Button>

                    {/* Optional: Add a stop button? */}
                    {/* {(status === 'generating_first' || status === 'generating_subsequent') && (
                        <Button variant="destructive" onClick={handleStop} disabled={!isGeneratingRef.current}>
                             <Square className="mr-2 h-4 w-4" /> Stop
                        </Button>
                    )} */}
                 </div>
            </div>
        </CardContent>
    </Card>
  );
};

export default SectionGenerator;
