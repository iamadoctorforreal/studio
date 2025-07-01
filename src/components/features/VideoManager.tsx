'use client';

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Download, Film, CheckSquare, Square, Play, ExternalLink } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import Image from 'next/image';
import { getVideoClips } from '@/services/pexels';
import type { VideoClip } from '@/services/pexels';

const VideoManager: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [keywords, setKeywords] = useState("");
  const [resolution, setResolution] = useState("1920x1080");
  const [videoClips, setVideoClips] = useState<VideoClip[]>([]);
  const [selectedClips, setSelectedClips] = useState<VideoClip[]>([]);
  const { toast } = useToast();

  const fetchVideos = async () => {
    if (!keywords.trim()) {
      toast({ 
        variant: "destructive", 
        title: "Missing Keywords", 
        description: "Please enter keywords to search for videos." 
      });
      return;
    }
    
    setIsLoading(true);
    setVideoClips([]);
    setSelectedClips([]);

    try {
      const clips = await getVideoClips(keywords);
      setVideoClips(clips);
      
      if (clips.length > 0) {
        toast({ 
          title: "Videos Found", 
          description: `Found ${clips.length} video clips for "${keywords}".` 
        });
      } else {
        toast({ 
          title: "No Videos Found", 
          description: "No video clips matched your keywords." 
        });
      }
    } catch (error) {
      console.error("Error fetching video clips:", error);
      toast({ 
        variant: "destructive", 
        title: "Fetch Failed", 
        description: "Could not fetch video clips from Pexels." 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClipSelection = (clip: VideoClip) => {
    setSelectedClips(prev => {
      const isSelected = prev.some(c => c.id === clip.id);
      if (isSelected) {
        return prev.filter(c => c.id !== clip.id);
      } else {
        return [...prev, clip];
      }
    });
  };

  const downloadSelectedClips = async () => {
    if (selectedClips.length === 0) {
      toast({ 
        variant: "destructive", 
        title: "No Clips Selected", 
        description: "Please select at least one video clip to download." 
      });
      return;
    }

    toast({ 
      title: "Download Started", 
      description: `Starting download of ${selectedClips.length} video clips...` 
    });

    // Download each selected clip
    for (const clip of selectedClips) {
      try {
        const response = await fetch(clip.url);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `video_${clip.id}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error(`Error downloading clip ${clip.id}:`, error);
        toast({
          variant: "destructive",
          title: "Download Failed",
          description: `Failed to download video ${clip.id}`
        });
      }
    }

    toast({ 
      title: "Downloads Complete", 
      description: `Successfully initiated downloads for ${selectedClips.length} clips.` 
    });
  };

  const exportClipsList = () => {
    if (selectedClips.length === 0) {
      toast({ 
        variant: "destructive", 
        title: "No Clips Selected", 
        description: "Please select clips to export." 
      });
      return;
    }

    const clipData = selectedClips.map(clip => ({
      id: clip.id,
      url: clip.url,
      thumbnail: clip.thumbnail,
      duration: clip.duration,
      resolution: `${clip.width}x${clip.height}`,
      creator: clip.user.name
    }));

    const dataStr = JSON.stringify(clipData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `selected_clips_${keywords.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({ 
      title: "List Exported", 
      description: "Selected clips list exported as JSON." 
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Video Clip Manager</CardTitle>
        <CardDescription>
          Search and download relevant video clips from Pexels based on keywords.
        </CardDescription>
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
              onKeyDown={(e) => e.key === 'Enter' && fetchVideos()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="resolution">Preferred Resolution</Label>
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
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Search Videos
          </Button>
        </div>

        {videoClips.length > 0 && (
          <div className="mt-6 pt-6 border-t space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                Available Video Clips ({videoClips.length})
              </h3>
              <div className="flex gap-2">
                <Button 
                  onClick={exportClipsList} 
                  variant="outline" 
                  size="sm"
                  disabled={selectedClips.length === 0}
                >
                  Export List ({selectedClips.length})
                </Button>
                <Button 
                  onClick={downloadSelectedClips} 
                  disabled={selectedClips.length === 0}
                  size="sm"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Selected ({selectedClips.length})
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {videoClips.map((clip) => {
                const isSelected = selectedClips.some(c => c.id === clip.id);
                
                return (
                  <div 
                    key={clip.id} 
                    className={`relative group border rounded-lg overflow-hidden shadow-sm transition-all hover:shadow-md ${
                      isSelected ? 'ring-2 ring-primary' : ''
                    }`}
                  >
                    <div className="relative aspect-video">
                      <Image
                        src={clip.thumbnail || `https://picsum.photos/seed/${clip.id}/400/300`}
                        alt={`Video clip ${clip.id}`}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                      />
                      
                      {/* Selection checkbox */}
                      <div
                        className="absolute top-2 left-2 cursor-pointer bg-background/80 p-1 rounded backdrop-blur-sm"
                        onClick={() => handleClipSelection(clip)}
                        role="checkbox"
                        aria-checked={isSelected}
                        tabIndex={0}
                        onKeyDown={(e) => 
                          (e.key === 'Enter' || e.key === ' ') && handleClipSelection(clip)
                        }
                      >
                        {isSelected ? (
                          <CheckSquare className="h-5 w-5 text-primary" />
                        ) : (
                          <Square className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>

                      {/* Duration badge */}
                      <div className="absolute top-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
                        {Math.round(clip.duration)}s
                      </div>

                      {/* Play overlay */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <Play className="h-12 w-12 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>

                    {/* Clip info */}
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {clip.width}×{clip.height}
                        </span>
                        <span className="text-muted-foreground">
                          ID: {clip.id}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground truncate">
                          by {clip.user.name}
                        </span>
                        <a
                          href={clip.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          Preview <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {videoClips.length === 0 && !isLoading && keywords && (
          <div className="text-center py-8 text-muted-foreground">
            <Film className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No videos found for "{keywords}". Try different keywords.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VideoManager;