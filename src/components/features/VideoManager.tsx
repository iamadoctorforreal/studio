'use client';

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Download, Film, CheckSquare, Square } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import Image from 'next/image';
import { getVideoClips } from '@/services/pexels'; // Import the service
import type { VideoClip } from '@/services/pexels';


const VideoManager: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [keywords, setKeywords] = useState("");
  const [resolution, setResolution] = useState("1920x1080"); // Default resolution
  const [videoClips, setVideoClips] = useState<VideoClip[]>([]);
  const [selectedClips, setSelectedClips] = useState<string[]>([]); // Store URLs of selected clips
  const { toast } = useToast();

   // Fetch video clips based on keywords
  const fetchVideos = async () => {
    if (!keywords.trim()) {
        toast({ variant: "destructive", title: "Missing Keywords", description: "Please enter keywords to search for videos." });
        return;
    }
    setIsLoading(true);
    setVideoClips([]);
    setSelectedClips([]); // Reset selection

    try {
      // TODO: Pass resolution to Pexels API if supported
      const clips = await getVideoClips(keywords);
      setVideoClips(clips);
       if (clips.length > 0) {
         toast({ title: "Videos Found", description: `Found ${clips.length} video clips (placeholder).` });
       } else {
         toast({ title: "No Videos Found", description: "No video clips matched your keywords (placeholder)." });
       }
    } catch (error) {
      console.error("Error fetching video clips:", error);
      toast({ variant: "destructive", title: "Fetch Failed", description: "Could not fetch video clips from Pexels." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckboxChange = (url: string) => {
    setSelectedClips(prev =>
      prev.includes(url) ? prev.filter(clipUrl => clipUrl !== url) : [...prev, url]
    );
  };

  // Placeholder for joining videos
  const joinVideos = async () => {
      if (selectedClips.length < 2) {
          toast({ variant: "destructive", title: "Not Enough Clips", description: "Please select at least two video clips to join." });
          return;
      }
      setIsLoading(true);
      toast({ title: "Joining Videos", description: "Processing selected video clips... (Placeholder)" });
       // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      // TODO: Implement actual video joining logic (likely server-side or using a library like ffmpeg.wasm)
      console.log("Joining videos:", selectedClips, "at resolution:", resolution);
      toast({ title: "Videos Joined (Placeholder)", description: "Selected video clips have been processed." });
      setIsLoading(false);
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle>Video Clip Manager</CardTitle>
        <CardDescription>Download relevant video clips from Pexels based on keywords and join them together.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
         <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-1.5">
                <Label htmlFor="keywords">Keywords</Label>
                <Input
                    id="keywords"
                    placeholder="Enter keywords (e.g., city skyline, technology)"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                />
            </div>
             <div className="space-y-1.5">
                <Label htmlFor="resolution">Resolution</Label>
                 <Select value={resolution} onValueChange={setResolution}>
                    <SelectTrigger id="resolution">
                        <SelectValue placeholder="Select resolution" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1920x1080">1920x1080 (Full HD)</SelectItem>
                        <SelectItem value="1280x720">1280x720 (HD)</SelectItem>
                        <SelectItem value="3840x2160">3840x2160 (4K)</SelectItem>
                        <SelectItem value="1080x1920">1080x1920 (Vertical HD)</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <Button onClick={fetchVideos} disabled={isLoading || !keywords.trim()}>
                {isLoading && videoClips.length === 0 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Fetch Videos
            </Button>
         </div>


        {videoClips.length > 0 && (
          <div className="mt-6 pt-6 border-t">
            <h3 className="text-lg font-semibold mb-4">Available Video Clips (Placeholders):</h3>
             <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {videoClips.map((clip, index) => (
                  <div key={index} className="relative group border rounded-lg overflow-hidden shadow-sm">
                     {/* Placeholder Image - Replace with actual video thumbnails */}
                    <Image
                      src={`https://picsum.photos/seed/${keywords.replace(/\s/g, '')}${index}/300/200`} // Basic seeded image
                      alt={`Video clip placeholder ${index + 1}`}
                      width={300}
                      height={200}
                      className="w-full h-32 object-cover transition-transform group-hover:scale-105"
                       data-ai-hint={keywords} // Hint for image generation if needed
                    />
                     <div
                        className="absolute top-2 left-2 cursor-pointer bg-background/70 p-1 rounded"
                         onClick={() => handleCheckboxChange(clip.url)}
                        role="checkbox"
                        aria-checked={selectedClips.includes(clip.url)}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? handleCheckboxChange(clip.url) : null}
                     >
                        {selectedClips.includes(clip.url) ? (
                             <CheckSquare className="h-5 w-5 text-primary" />
                         ) : (
                            <Square className="h-5 w-5 text-muted-foreground" />
                         )}
                     </div>
                     <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                        <p className="text-white text-xs truncate">{clip.url}</p>
                     </div>
                  </div>
                ))}
            </div>
             <Button onClick={joinVideos} disabled={isLoading || selectedClips.length < 2} className="mt-6 bg-accent text-accent-foreground hover:bg-accent/90">
                {isLoading && selectedClips.length > 0 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
                Join Selected Clips ({selectedClips.length})
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VideoManager;
