
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowRight, Mic } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { generateSingleArticleSection } from '@/ai/flows/generate-article-section';
import type { GenerateSingleArticleSectionOutput } from '@/ai/flows/generate-article-section';
import { ScrollArea } from '@/components/ui/scroll-area';

// Helper to parse outline (simple example, might need more robust parsing)
const parseOutline = (outline: string): string[] => {
  if (!outline) return [];
  // Split by lines, trim whitespace, remove empty lines and list markers (like '1.', '-', '*')
  return outline
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => line.replace(/^(?:\d+\.|-|\*)\s*/, '')) // Remove list markers
    .filter(line => line.length > 0); // Filter again after removing markers
};

interface SectionGeneratorProps {
  articleTitle: string;
  articleOutline: string;
  focusKeyPhrase: string;
  onProceedToVoiceOver: (fullArticleText: string) => void;
}

const SectionGenerator: React.FC<SectionGeneratorProps> = ({
  articleTitle,
  articleOutline,
  focusKeyPhrase,
  onProceedToVoiceOver
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [generatedSections, setGeneratedSections] = useState<Record<string, string>>({}); // Store content by section topic
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number>(0); // Index of the section *to be* generated
  const [isComplete, setIsComplete] = useState(false);
  const { toast } = useToast();

  // Memoize parsed outline sections
  const outlineSections = useMemo(() => parseOutline(articleOutline), [articleOutline]);
  const totalSections = outlineSections.length;

  // Effect to check completion status
  useEffect(() => {
    // Check if content exists for *all* parsed sections
    const allGenerated = totalSections > 0 && outlineSections.every(topic => !!generatedSections[topic]);
    setIsComplete(allGenerated);
    if (allGenerated) {
         setCurrentSectionIndex(totalSections); // Set index past the last section
         toast({ title: "Article Complete", description: "All sections have been generated." });
    }
  }, [generatedSections, outlineSections, totalSections, toast]);


  // Function to generate the *next* section based on currentSectionIndex
  const generateNextSection = useCallback(async () => {
    // Check if we are already done or if the outline is invalid
    if (isComplete || currentSectionIndex >= totalSections || !outlineSections[currentSectionIndex]) {
      toast({ variant: "destructive", title: "Error", description: isComplete ? "All sections already generated." : "No more sections to generate or outline is invalid." });
      setIsLoading(false); // Ensure loading is stopped
      return;
    }

    const sectionTopic = outlineSections[currentSectionIndex];
    setIsLoading(true);

    try {
      // Prepare previous content for context (optional, join with separator)
      const previousContent = outlineSections
        .slice(0, currentSectionIndex)
        .map(topic => generatedSections[topic])
        .filter(Boolean) // Filter out any potentially undefined content
        .join('\n\n---\n\n'); // Use a clear separator for context

      const input = {
        title: articleTitle,
        focusKeyPhrase: focusKeyPhrase,
        sectionTopic: sectionTopic,
        sectionIndex: currentSectionIndex,
        totalSections: totalSections,
        previousSectionsContent: previousContent || undefined, // Send undefined if no previous content
      };
      console.log("Generating section with input:", input); // Log input for debugging

      const result: GenerateSingleArticleSectionOutput = await generateSingleArticleSection(input);

      setGeneratedSections(prev => ({
        ...prev,
        [sectionTopic]: result.sectionContent // Add the newly generated section
      }));

      toast({
        title: `Section ${currentSectionIndex + 1}/${totalSections} Generated`,
        description: `Content for "${sectionTopic}" created.`,
      });

      // Move to the *next* index, ready for the user to click again
      setCurrentSectionIndex(prev => prev + 1);


    } catch (error) {
      console.error(`Error generating section "${sectionTopic}":`, error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: `Could not generate section "${sectionTopic}": ${errorMessage}. Please try again.`,
      });
    } finally {
      setIsLoading(false);
    }
  }, [currentSectionIndex, totalSections, outlineSections, articleTitle, focusKeyPhrase, generatedSections, toast, isComplete]); // Added dependencies

  // Function called when the "Format for Voice Over" button is clicked
  const handleProceedToVoiceOverClick = () => {
    if (!isComplete) {
         toast({ variant: "destructive", title: "Incomplete Article", description: "Please generate all sections first." });
         return;
    }
    // Combine all sections in order of the outline
    const fullArticle = outlineSections
      .map(topic => generatedSections[topic] || `// ERROR: Content for "${topic}" missing //`) // Add fallback for safety
      .join('\n\n'); // Add double newline between sections for basic formatting

    console.log("Formatted Full Article for Voice Over:", fullArticle); // Log the combined text
    onProceedToVoiceOver(fullArticle); // Pass the formatted string to the parent
  };


  // Check if prerequisites are met
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

  // Display if outline parsing failed
    if (totalSections === 0 && articleOutline) {
         return (
            <Card>
                <CardHeader>
                    <CardTitle>Article Section Generator</CardTitle>
                     <CardDescription>Article: <strong>{articleTitle}</strong> | Focus: <strong>{focusKeyPhrase}</strong></CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-destructive">Could not parse any sections from the provided outline. Please go back and ensure the outline is a valid list format (numbered or bulleted).</p>
                </CardContent>
            </Card>
        );
    }


  return (
    <Card>
        <CardHeader>
            <CardTitle>Article Section Generator</CardTitle>
            <CardDescription>Generate content for each section of your article outline one by one.</CardDescription>
             <p className="text-sm text-muted-foreground pt-2">Article: <strong>{articleTitle}</strong></p>
             <p className="text-sm text-muted-foreground">Focus: <strong>{focusKeyPhrase}</strong></p>
        </CardHeader>
        <CardContent>
             <div className="space-y-6">
                {/* Display Generated Sections */}
                 <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Generated Content ({Object.keys(generatedSections).length}/{totalSections} sections):</h3>
                    <ScrollArea className="h-72 w-full rounded-md border p-4 bg-secondary">
                        {outlineSections.map((topic, index) => (
                            <div key={index} className="mb-4 p-3 bg-card rounded shadow-sm">
                                <h4 className="font-semibold text-md mb-1">{index + 1}. {topic}</h4>
                                {generatedSections[topic] ? (
                                    // Use a div with whitespace-pre-wrap for better display than readOnly textarea
                                    <div className="whitespace-pre-wrap text-sm p-2 bg-background rounded border border-input">
                                        {generatedSections[topic]}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground italic">
                                        {index === currentSectionIndex && isLoading ? 'Generating...' : 'Pending...'}
                                     </p>
                                )}
                            </div>
                        ))}
                         {isLoading && currentSectionIndex < totalSections && (
                            <div className="flex items-center justify-center p-4">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                <span className="ml-2 text-muted-foreground">Generating section: "{outlineSections[currentSectionIndex]}"...</span>
                            </div>
                         )}
                         {isComplete && (
                             <p className="text-center font-medium text-green-600 p-4">All sections generated successfully!</p>
                         )}
                    </ScrollArea>
                </div>

                {/* Control Buttons */}
                <div className="flex gap-4 items-center">
                    {!isComplete ? (
                        <Button onClick={generateNextSection} disabled={isLoading || currentSectionIndex >= totalSections}>
                        {isLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <ArrowRight className="mr-2 h-4 w-4" />
                        )}
                         {isLoading ? `Generating Section ${currentSectionIndex + 1}...` : `Can I create the next section now (${currentSectionIndex + 1}/${totalSections})?`}
                        </Button>
                    ) : (
                         <Button onClick={handleProceedToVoiceOverClick} className="bg-accent text-accent-foreground hover:bg-accent/90">
                            <Mic className="mr-2 h-4 w-4" />
                            Format for Voice Over Now
                        </Button>
                    )}
                    {isLoading && (
                         <p className="text-sm text-muted-foreground">Please wait...</p>
                    )}
                    {!isLoading && !isComplete && currentSectionIndex > 0 && (
                        <p className="text-sm text-muted-foreground">Click the button to generate the next section.</p>
                    )}
                 </div>
            </div>
        </CardContent>
    </Card>
  );
};

export default SectionGenerator;
