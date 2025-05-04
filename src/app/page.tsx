'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OutlineGenerator from '@/components/features/OutlineGenerator';
import SectionGenerator from '@/components/features/SectionGenerator';
import VoiceOverGenerator from '@/components/features/VoiceOverGenerator';
import SrtChunker from '@/components/features/SrtChunker';
import VideoManager from '@/components/features/VideoManager';

export default function Home() {
  const [activeTab, setActiveTab] = useState('outline');
  const [articleTitle, setArticleTitle] = useState<string>("");
  const [articleOutline, setArticleOutline] = useState<string>("");
  const [focusKeyPhrase, setFocusKeyPhrase] = useState<string>("");
  const [fullArticleText, setFullArticleText] = useState<string>(""); // State for the complete article text

  // Callback function for OutlineGenerator
  const handleOutlineGenerated = (title: string, outline: string, keyPhrase: string) => {
    console.log("Outline generated, updating state and switching to section tab.");
    setArticleTitle(title);
    setArticleOutline(outline);
    setFocusKeyPhrase(keyPhrase);
    setFullArticleText(""); // Reset article text when a new outline is generated
    setActiveTab('section'); // Switch tab after outline generation
  };

  // Callback function for SectionGenerator (to proceed to voice-over)
  const handleProceedToVoiceOver = (generatedArticleText: string) => {
    console.log(`Proceeding to Voice Over. Received article text length: ${generatedArticleText.length}`);
    // console.log("Full Article Text for Voice Over:", generatedArticleText.substring(0, 200) + "..."); // Log prefix
    setFullArticleText(generatedArticleText); // Set the full article text state
    setActiveTab('voiceover'); // Switch to the voiceover tab
  };


  return (
    <div className="w-full max-w-4xl mx-auto">
       <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5 mb-6">
          <TabsTrigger value="outline">1. Outline</TabsTrigger>
          <TabsTrigger value="section">2. Sections</TabsTrigger>
          <TabsTrigger value="voiceover">3. Voice-Over</TabsTrigger>
          <TabsTrigger value="srt">4. SRT Chunker</TabsTrigger>
          <TabsTrigger value="video">5. Video Clips</TabsTrigger>
        </TabsList>
        <TabsContent value="outline">
            {/* Pass the callback to OutlineGenerator */}
            <OutlineGenerator onOutlineGenerated={handleOutlineGenerated} />
        </TabsContent>
        <TabsContent value="section">
            {/* Pass title, outline, and key phrase to SectionGenerator */}
            {/* Key ensures re-mount if outline changes, triggering generation */}
            <SectionGenerator
              articleTitle={articleTitle}
              articleOutline={articleOutline}
              focusKeyPhrase={focusKeyPhrase}
              onProceedToVoiceOver={handleProceedToVoiceOver}
              key={articleTitle + articleOutline + focusKeyPhrase} // More robust key
            />
        </TabsContent>
         <TabsContent value="voiceover">
            {/* Pass the generated article text to VoiceOverGenerator */}
            {/* Key ensures VoiceOverGenerator updates when fullArticleText changes */}
            <VoiceOverGenerator
                 initialArticleText={fullArticleText}
                 key={fullArticleText} // Force re-render/update when text is ready
             />
        </TabsContent>
         <TabsContent value="srt">
            <SrtChunker />
        </TabsContent>
         <TabsContent value="video">
             <VideoManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}