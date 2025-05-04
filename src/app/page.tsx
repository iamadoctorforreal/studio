'use client';

import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OutlineGenerator from '@/components/features/OutlineGenerator';
import SectionGenerator from '@/components/features/SectionGenerator';
import VoiceOverGenerator from '@/components/features/VoiceOverGenerator';
import SrtChunker from '@/components/features/SrtChunker';
import VideoManager from '@/components/features/VideoManager';

export default function Home() {
  return (
    <div className="w-full max-w-4xl mx-auto">
       <Tabs defaultValue="outline" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5 mb-6">
          <TabsTrigger value="outline">Outline</TabsTrigger>
          <TabsTrigger value="section">Sections</TabsTrigger>
          <TabsTrigger value="voiceover">Voice-Over</TabsTrigger>
          <TabsTrigger value="srt">SRT Chunker</TabsTrigger>
          <TabsTrigger value="video">Video Clips</TabsTrigger>
        </TabsList>
        <TabsContent value="outline">
            <OutlineGenerator />
        </TabsContent>
        <TabsContent value="section">
            <SectionGenerator />
        </TabsContent>
         <TabsContent value="voiceover">
            <VoiceOverGenerator />
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
