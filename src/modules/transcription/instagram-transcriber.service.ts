import axios from 'axios';

export interface InstagramMetadata {
  shortcode: string;
  title: string;
  creatorName: string;
  thumbnailUrl: string;
  mediaUrl?: string;
}

export class InstagramTranscriberService {
  /**
   * Extract Instagram shortcode from Reel or Post URL
   * e.g. https://www.instagram.com/reel/DDK9283kx/ -> DDK9283kx
   */
  extractShortcode(url: string): string | null {
    if (!url) return null;
    const match = url.trim().match(/instagram\.com\/(?:reel|p|tv|reels)\/([A-Za-z0-9_-]+)/i);
    return match ? match[1] : null;
  }

  /**
   * Attempt to fetch public Reel metadata using oEmbed or public page headers
   */
  async fetchMetadata(url: string, shortcode: string): Promise<InstagramMetadata> {
    const defaultMeta: InstagramMetadata = {
      shortcode,
      title: `Instagram Reel (${shortcode})`,
      creatorName: 'Instagram Creator',
      thumbnailUrl: '',
    };

    try {
      // Instagram public oembed
      const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}`;
      const res = await axios.get(oembedUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 6000,
      });

      if (res.data) {
        return {
          shortcode,
          title: res.data.title ? res.data.title.slice(0, 100) : defaultMeta.title,
          creatorName: res.data.author_name || defaultMeta.creatorName,
          thumbnailUrl: res.data.thumbnail_url || '',
        };
      }
    } catch {
      // Instagram oembed frequently requires token or blocks cloud IPs
    }

    return defaultMeta;
  }

  /**
   * Attempt media resolution for public Instagram Reel
   */
  async resolveMediaAudioUrl(url: string): Promise<{ audioUrl?: string; requiresFallback: boolean; error?: string }> {
    try {
      // Try public reel metadata extraction through lightweight headers
      const res = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 8000,
      });

      const html = res.data;
      // Check for video_url in page meta
      const videoMatch = html.match(/"video_url":"([^"]+)"/);
      if (videoMatch && videoMatch[1]) {
        const decodedUrl = videoMatch[1].replace(/\\u0026/g, '&');
        return { audioUrl: decodedUrl, requiresFallback: false };
      }

      // Check for og:video meta tag
      const ogVideoMatch = html.match(/<meta property="og:video" content="([^"]+)"/);
      if (ogVideoMatch && ogVideoMatch[1]) {
        return { audioUrl: ogVideoMatch[1], requiresFallback: false };
      }
    } catch (err: any) {
      console.warn(`[InstagramTranscriberService] Direct fetch challenged: ${err.message}`);
    }

    // When Instagram challenges cloud IP or requires login
    return {
      requiresFallback: true,
      error: 'Instagram rate-limited or blocked direct cloud download for this Reel.',
    };
  }
}
