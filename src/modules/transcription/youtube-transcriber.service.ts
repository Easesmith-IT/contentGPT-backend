import axios from 'axios';
import { YoutubeTranscript } from 'youtube-transcript';
import { ITranscriptSegment } from '../../models/Transcript';

export interface YouTubeMetadata {
  videoId: string;
  title: string;
  creatorName: string;
  thumbnailUrl: string;
}

export class YouTubeTranscriberService {
  /**
   * Extract YouTube Video ID from any valid YouTube URL format
   * Supports: standard watch, youtu.be, shorts, embed, mobile
   */
  extractVideoId(url: string): string | null {
    if (!url) return null;
    const trimmed = url.trim();

    // Standard watch URL: youtube.com/watch?v=ID
    const watchMatch = trimmed.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    if (watchMatch && watchMatch[1]) {
      return watchMatch[1];
    }

    // Shorts URL: youtube.com/shorts/ID
    const shortsMatch = trimmed.match(/youtube\.com\/shorts\/([^"&?\/\s]{11})/i);
    if (shortsMatch && shortsMatch[1]) {
      return shortsMatch[1];
    }

    return null;
  }

  /**
   * Fetch video title, channel name, and thumbnail using YouTube oEmbed (Free, zero API key)
   */
  async fetchMetadata(videoId: string): Promise<YouTubeMetadata> {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const defaultMeta: YouTubeMetadata = {
      videoId,
      title: 'YouTube Sports Video',
      creatorName: 'YouTube Creator',
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };

    try {
      const res = await axios.get(`https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`, {
        timeout: 6000,
      });

      if (res.data) {
        return {
          videoId,
          title: res.data.title || defaultMeta.title,
          creatorName: res.data.author_name || defaultMeta.creatorName,
          thumbnailUrl: res.data.thumbnail_url || defaultMeta.thumbnailUrl,
        };
      }
    } catch {
      // Fallback to defaults
    }

    return defaultMeta;
  }

  /**
   * Format seconds to "MM:SS" or "HH:MM:SS"
   */
  formatTimestamp(totalSeconds: number): string {
    const sec = Math.floor(totalSeconds);
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  /**
   * Fetch direct subtitles / captions using youtube-transcript
   */
  async extractCaptions(videoId: string): Promise<{
    segments: ITranscriptSegment[];
    rawText: string;
    durationSeconds: number;
  }> {
    const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);

    if (!transcriptItems || transcriptItems.length === 0) {
      throw new Error('No public captions or subtitles found for this YouTube video.');
    }

    const segments: ITranscriptSegment[] = [];
    let lastEnd = 0;

    for (const item of transcriptItems) {
      const start = item.offset / 1000;
      const duration = item.duration / 1000;
      const end = start + duration;
      if (end > lastEnd) lastEnd = end;

      // Decode HTML entities if present in captions (like &amp;, &#39;, &quot;)
      const cleanText = item.text
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n/g, ' ')
        .trim();

      if (cleanText) {
        segments.push({
          start,
          end,
          timestamp: this.formatTimestamp(start),
          speaker: 'Speaker',
          textOriginal: cleanText,
          textEnglish: cleanText,
          textHinglish: cleanText,
        });
      }
    }

    const rawText = segments.map((s) => s.textOriginal).join(' ');

    return {
      segments,
      rawText,
      durationSeconds: Math.ceil(lastEnd),
    };
  }
}
