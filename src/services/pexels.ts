/**
 * Pexels API service for fetching video clips
 */

export interface VideoClip {
  id: number;
  url: string;
  thumbnail: string;
  duration: number;
  width: number;
  height: number;
  user: {
    name: string;
    url: string;
  };
}

export interface PexelsVideoResponse {
  videos: Array<{
    id: number;
    width: number;
    height: number;
    duration: number;
    user: {
      name: string;
      url: string;
    };
    video_files: Array<{
      id: number;
      quality: string;
      file_type: string;
      width: number;
      height: number;
      link: string;
    }>;
    video_pictures: Array<{
      id: number;
      picture: string;
      nr: number;
    }>;
  }>;
  page: number;
  per_page: number;
  total_results: number;
  next_page?: string;
}

/**
 * Fetches video clips from Pexels API based on keywords
 */
export async function getVideoClips(keywords: string, perPage: number = 15): Promise<VideoClip[]> {
  const PEXELS_API_KEY = process.env.NEXT_PUBLIC_PEXELS_API_KEY;
  
  if (!PEXELS_API_KEY) {
    console.warn('Pexels API key not configured, returning placeholder videos');
    // Return placeholder data when API key is not available
    return Array.from({ length: 8 }, (_, index) => ({
      id: index + 1,
      url: `https://example.com/video${index + 1}.mp4`,
      thumbnail: `https://picsum.photos/seed/${keywords.replace(/\s/g, '')}${index}/400/300`,
      duration: 30 + Math.random() * 60,
      width: 1920,
      height: 1080,
      user: {
        name: `Creator ${index + 1}`,
        url: 'https://pexels.com'
      }
    }));
  }

  try {
    const response = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(keywords)}&per_page=${perPage}`,
      {
        headers: {
          'Authorization': PEXELS_API_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Pexels API error: ${response.status} ${response.statusText}`);
    }

    const data: PexelsVideoResponse = await response.json();

    return data.videos.map(video => {
      // Find the best quality video file
      const videoFile = video.video_files
        .filter(file => file.file_type === 'video/mp4')
        .sort((a, b) => b.width - a.width)[0];

      // Get thumbnail
      const thumbnail = video.video_pictures[0]?.picture || '';

      return {
        id: video.id,
        url: videoFile?.link || '',
        thumbnail,
        duration: video.duration,
        width: video.width,
        height: video.height,
        user: video.user
      };
    });
  } catch (error) {
    console.error('Error fetching videos from Pexels:', error);
    // Return placeholder data on error
    return Array.from({ length: 4 }, (_, index) => ({
      id: index + 1,
      url: `https://example.com/video${index + 1}.mp4`,
      thumbnail: `https://picsum.photos/seed/${keywords.replace(/\s/g, '')}${index}/400/300`,
      duration: 30 + Math.random() * 60,
      width: 1920,
      height: 1080,
      user: {
        name: `Creator ${index + 1}`,
        url: 'https://pexels.com'
      }
    }));
  }
}