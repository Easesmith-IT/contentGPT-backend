import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface InstagramMetadata {
  shortcode: string;
  title: string;
  creatorName: string;
  thumbnailUrl: string;
  mediaUrl?: string;
}

export interface InstagramResolutionResult {
  streamUrl?: string;
  title?: string;
  creatorName?: string;
  thumbnailUrl?: string;
  requiresFallback: boolean;
  error?: string;
}

export class InstagramTranscriberService {
  /**
   * Extract Instagram shortcode from Reel or Post URL
   * e.g. https://www.instagram.com/reel/C71g1eovTzD/ -> C71g1eovTzD
   */
  extractShortcode(url: string): string | null {
    if (!url) return null;
    const match = url.trim().match(/instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
    return match ? match[1] : null;
  }

  /**
   * Attempt to fetch public Reel metadata using oEmbed or fallback
   */
  async fetchMetadata(url: string, shortcode: string): Promise<InstagramMetadata> {
    const defaultMeta: InstagramMetadata = {
      shortcode,
      title: `Instagram Reel (${shortcode})`,
      creatorName: 'Instagram Creator',
      thumbnailUrl: '',
    };

    try {
      const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}`;
      const res = await axios.get(oembedUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 5000,
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
      // oEmbed is best-effort
    }

    return defaultMeta;
  }

  /**
   * Resolve direct media stream URL for the Reel
   * Tries:
   * 1. Session ID via ultra-igdl (if INSTAGRAM_SESSION_ID configured)
   * 2. RapidAPI Social/Instagram Downloader (if RAPIDAPI_KEY is configured & subscribed)
   * 3. Fallback notice prompting file drop or API key configuration
   */
  async resolveMediaAudioUrl(url: string): Promise<InstagramResolutionResult> {
    const shortcode = this.extractShortcode(url) || 'reel';
    const metadata = await this.fetchMetadata(url, shortcode);

    // Strategy 1: Check if INSTAGRAM_SESSION_ID is provided in environment
    const sessionId = process.env.INSTAGRAM_SESSION_ID;
    if (sessionId) {
      try {
        const { ultraigdl } = require('ultra-igdl');
        const client = new ultraigdl({
          sessionId: sessionId.trim(),
          timeoutMs: 12000,
          userAgentRotation: true,
        });

        const downloadResult = await client.download(url);
        if (downloadResult && downloadResult.media && downloadResult.media.length > 0) {
          const videoItem = downloadResult.media.find((m: any) => m.type === 'video' || m.url?.includes('.mp4')) || downloadResult.media[0];
          if (videoItem && videoItem.url) {
            return {
              streamUrl: videoItem.url,
              title: downloadResult.title || metadata.title,
              creatorName: downloadResult.author || metadata.creatorName,
              thumbnailUrl: downloadResult.thumbnail || metadata.thumbnailUrl,
              requiresFallback: false,
            };
          }
        }
      } catch (err: any) {
        console.warn(`[InstagramTranscriberService] ultra-igdl session resolution error: ${err.message}`);
      }
    }

    // Strategy 2: Check RapidAPI if configured
    const rapidKey = process.env.RAPIDAPI_KEY;
    if (rapidKey) {
      try {
        const rapidHosts = [
          'instagram-downloader51.p.rapidapi.com',
          'social-download-all-in-one.p.rapidapi.com',
          'instagram-reels-downloader-api.p.rapidapi.com',
        ];

        for (const host of rapidHosts) {
          try {
            const res = await axios({
              method: host.includes('social') ? 'POST' : 'GET',
              url: host.includes('social') 
                ? `https://${host}/v1/social/autolink`
                : `https://${host}/download?url=${encodeURIComponent(url)}`,
              headers: {
                'x-rapidapi-key': rapidKey,
                'x-rapidapi-host': host,
              },
              data: host.includes('social') ? { url } : undefined,
              timeout: 8000,
            });

            const stream = res.data?.download_url || res.data?.url || res.data?.media?.[0]?.url;
            if (stream) {
              return {
                streamUrl: stream,
                title: metadata.title,
                creatorName: metadata.creatorName,
                thumbnailUrl: metadata.thumbnailUrl,
                requiresFallback: false,
              };
            }
          } catch {
            // Continue to next host
          }
        }
      } catch (err: any) {
        console.warn(`[InstagramTranscriberService] RapidAPI resolution error: ${err.message}`);
      }
    }

    // Strategy 3: Supadata API if SUPADATA_API_KEY is configured
    const supadataKey = process.env.SUPADATA_API_KEY;
    if (supadataKey) {
      try {
        const res = await axios.get(`https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(url)}`, {
          headers: { 'x-api-key': supadataKey },
          timeout: 15000,
        });
        if (res.data?.content || res.data?.transcript) {
          // Direct transcript already resolved
          return {
            title: metadata.title,
            creatorName: metadata.creatorName,
            thumbnailUrl: metadata.thumbnailUrl,
            requiresFallback: false,
            // special payload flag
            streamUrl: `supadata:${encodeURIComponent(JSON.stringify(res.data))}`,
          };
        }
      } catch (err: any) {
        console.warn(`[InstagramTranscriberService] Supadata error: ${err.message}`);
      }
    }

    // Strategy 4: Fallback required
    return {
      requiresFallback: true,
      title: metadata.title,
      creatorName: metadata.creatorName,
      thumbnailUrl: metadata.thumbnailUrl,
      error:
        'Instagram restricts unauthenticated cloud IP scraping. Please upload the Reel video/audio below (or add INSTAGRAM_SESSION_ID to .env) to transcribe directly.',
    };
  }

  /**
   * Stream a resolved MP4 URL to a temporary file on disk for Gemini processing
   */
  async downloadStreamToTempFile(streamUrl: string, shortcode: string): Promise<string> {
    const tmpDir = path.join(os.tmpdir(), 'contentgpt-ig-streams');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const tmpFilePath = path.join(tmpDir, `ig-${shortcode}-${Date.now()}.mp4`);
    const writer = fs.createWriteStream(tmpFilePath);

    const response = await axios({
      method: 'GET',
      url: streamUrl,
      responseType: 'stream',
      timeout: 30000,
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(tmpFilePath));
      writer.on('error', (err) => {
        if (fs.existsSync(tmpFilePath)) {
          fs.unlinkSync(tmpFilePath);
        }
        reject(err);
      });
    });
  }
}
