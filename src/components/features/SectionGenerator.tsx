
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowRight, Mic } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { generateSingleArticleSection } from '@/ai/flows/generate-article-section'; // Updated import
import type { GenerateSingleArticleSectionOutput } from '@/ai/flows/generate-article-section'; // Updated import
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
  focusKeyPhrase: string; // Added focus key phrase prop
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
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number>(0);
  const [isComplete, setIsComplete] = useState(false);
  const { toast } = useToast();

  // Memoize parsed outline sections
  const outlineSections = useMemo(() => parseOutline(articleOutline), [articleOutline]);

  const totalSections = outlineSections.length;

  // Function to generate the current section
  const generateNextSection = useCallback(async () => {
    if (currentSectionIndex >= totalSections || !outlineSections[currentSectionIndex]) {
      toast({ variant: "destructive", title: "Error", description: "No more sections to generate or outline is invalid." });
      return;
    }

    const sectionTopic = outlineSections[currentSectionIndex];
    setIsLoading(true);

    try {
       // Check if the section already exists to prevent redundant API calls
      if (generatedSections[sectionTopic]) {
          toast({ title: "Info", description: `Section "${sectionTopic}" already generated.` });
          setCurrentSectionIndex(prev => prev + 1); // Move to next index
          if (currentSectionIndex + 1 >= totalSections) {
              setIsComplete(true);
          }
          setIsLoading(false);
          return;
      }

      const input = {
        title: articleTitle,
        focusKeyPhrase: focusKeyPhrase, // Pass focus key phrase
        sectionTopic: sectionTopic,
      };
      const result: GenerateSingleArticleSectionOutput = await generateSingleArticleSection(input); // Use updated flow

      setGeneratedSections(prev => ({
        ...prev,
        [sectionTopic]: result.sectionContent
      }));

      toast({
        title: `Section ${currentSectionIndex + 1}/${totalSections} Generated`,
        description: `Content for "${sectionTopic}" created.`,
      });

      if (currentSectionIndex + 1 >= totalSections) {
        setIsComplete(true);
      } else {
        setCurrentSectionIndex(prev => prev + 1);
      }

    } catch (error) {
      console.error(`Error generating section "${sectionTopic}":`, error);
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: `Could not generate section "${sectionTopic}". Please try again.`,
      });
    } finally {
      setIsLoading(false);
    }
  }, [currentSectionIndex, totalSections, outlineSections, articleTitle, focusKeyPhrase, generatedSections, toast]); // Added dependencies

  // Automatically generate the first section when the component mounts with a valid outline
  useEffect(() => {
    if (totalSections > 0 && currentSectionIndex === 0 && Object.keys(generatedSections).length === 0 && articleTitle && focusKeyPhrase) {
      generateNextSection();
    }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalSections, articleTitle, focusKeyPhrase]); // Run only when outline/title/keyphrase is ready

  const handleProceedToVoiceOverClick = () => {
    // Combine all sections in order
    const fullArticle = outlineSections
      .map(topic => generatedSections[topic] || `// Content for "${topic}" not generated //`)
      .join('\n\n'); // Add double newline between sections
    onProceedToVoiceOver(fullArticle);
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

  return (
    <Card>
        <CardHeader>
            <CardTitle>Article Section Generator</CardTitle>
            <CardDescription>Generate content for each section of your article outline one by one.</CardDescription>
             <p className="text-sm text-muted-foreground pt-2">Article: <strong>{articleTitle}</strong></p>
             <p className="text-sm text-muted-foreground">Focus: <strong>{focusKeyPhrase}</strong></p>
        </CardHeader>
        <CardContent>
            {totalSections === 0 && (
                <p className="text-destructive">Could not parse sections from the provided outline. Please ensure the outline is a valid list.</p>
            )}

            {totalSections > 0 && (
                 <div className="space-y-6">
                    {/* Display Generated Sections */}
                     <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Generated Content:</h3>
                        <ScrollArea className="h-72 w-full rounded-md border p-4 bg-secondary">
                            {outlineSections.map((topic, index) => (
                                <div key={index} className="mb-4">
                                    <h4 className="font-semibold text-md mb-1">{topic}</h4>
                                    {generatedSections[topic] ? (
                                        <Textarea
                                            readOnly
                                            value={generatedSections[topic]}
                                            className="min-h-[100px] bg-background text-foreground text-sm"
                                        />
                                    ) : (
                                        <p className="text-sm text-muted-foreground italic">
                                            {index <= currentSectionIndex ? 'Generating...' : 'Pending...'}
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
                        </ScrollArea>
                    </div>

                    {/* Control Buttons */}
                    <div className="flex gap-4">
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
                    </div>
                </div>
            )}


        </CardContent>
    </Card>
  );
};

export default SectionGenerator;
