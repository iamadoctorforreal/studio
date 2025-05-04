
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
    setArticleTitle(title);
    setArticleOutline(outline);
    setFocusKeyPhrase(keyPhrase);
    setFullArticleText(""); // Reset article text when a new outline is generated
    setActiveTab('section'); // Switch tab after outline generation
  };

  // Callback function for SectionGenerator (to proceed to voice-over)
  const handleProceedToVoiceOver = (generatedArticleText: string) => {
    console.log("Proceeding to Voice Over with article:", generatedArticleText);
    setFullArticleText(generatedArticleText); // Set the full article text state
    setActiveTab('voiceover'); // Switch to the voiceover tab
  };


  return (
    <div className="w-full max-w-4xl mx-auto">
       <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5 mb-6">
          <TabsTrigger value="outline">Outline</TabsTrigger>
          <TabsTrigger value="section">Sections</TabsTrigger>
          <TabsTrigger value="voiceover">Voice-Over</TabsTrigger>
          <TabsTrigger value="srt">SRT Chunker</TabsTrigger>
          <TabsTrigger value="video">Video Clips</TabsTrigger>
        </TabsList>
        <TabsContent value="outline">
            {/* Pass the callback to OutlineGenerator */}
            <OutlineGenerator onOutlineGenerated={handleOutlineGenerated} />
        </TabsContent>
        <TabsContent value="section">
            {/* Pass title, outline, and key phrase to SectionGenerator */}
            <SectionGenerator
              articleTitle={articleTitle}
              articleOutline={articleOutline}
              focusKeyPhrase={focusKeyPhrase} // Pass the key phrase
              onProceedToVoiceOver={handleProceedToVoiceOver}
              key={articleOutline} // Re-mount when outline changes
            />
        </TabsContent>
         <TabsContent value="voiceover">
            {/* Pass the generated article text to VoiceOverGenerator */}
            <VoiceOverGenerator initialArticleText={fullArticleText} />
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
