import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ITranscriptSegment } from '../../models/Transcript';

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

export interface SupadataTranscriptResult {
  rawText: string;
  segments: ITranscriptSegment[];
  durationSeconds: number;
  title: string;
  creatorName: string;
  thumbnailUrl: string;
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
   * Primary Provider: Transcribe directly with Supadata API
   * Handles metadata extraction, sync transcripts, and async polling jobs
   */
  async transcribeWithSupadata(url: string, shortcode: string): Promise<SupadataTranscriptResult | null> {
    const apiKey = process.env.SUPADATA_API_KEY || 'sd_9d41b23cea7c057fea1ef7efaa936d35';
    if (!apiKey) return null;

    try {
      const { Supadata } = require('@supadata/js');
      const client = new Supadata({ apiKey: apiKey.trim() });

      let title = `Instagram Reel (${shortcode})`;
      let creatorName = 'Instagram Creator';
      let thumbnailUrl = '';
      let durationSeconds = 0;

      // 1. Fetch metadata via Supadata or oEmbed
      try {
        const meta = await client.metadata({ url });
        if (meta) {
          title = meta.title || title;
          creatorName = meta.author?.displayName || meta.author?.username || creatorName;
          thumbnailUrl = meta.media?.thumbnailUrl || '';
          durationSeconds = meta.media?.duration || 0;
        }
      } catch {
        const oembed = await this.fetchMetadata(url, shortcode);
        title = oembed.title;
        creatorName = oembed.creatorName;
        thumbnailUrl = oembed.thumbnailUrl;
      }

      // 2. Fetch transcript (with auto AI transcription fallback)
      console.log(`[InstagramTranscriberService] Querying Supadata transcript for ${url}...`);
      let result = await client.transcript({ url, mode: 'auto' });

      // 3. If Supadata queued an async job, poll until complete
      if (result && 'jobId' in result && !result.content) {
        console.log(`[InstagramTranscriberService] Polling Supadata jobId: ${result.jobId}`);
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const statusRes = await client.transcript.getJobStatus(result.jobId);
          if (statusRes.status === 'completed' || statusRes.content) {
            result = statusRes;
            break;
          }
          if (statusRes.status === 'failed') {
            console.warn('[InstagramTranscriberService] Supadata job failed.');
            return null;
          }
        }
      }

      // 4. Parse content segments
      const content = result?.content;
      if (!content || !Array.isArray(content) || content.length === 0) {
        if (typeof result?.text === 'string' && result.text.trim()) {
          const rawText = result.text.trim();
          return {
            rawText,
            segments: [
              {
                start: 0,
                end: durationSeconds || 30,
                timestamp: '00:00',
                textOriginal: rawText,
              },
            ],
            durationSeconds: durationSeconds || 30,
            title,
            creatorName,
            thumbnailUrl,
          };
        }
        return null;
      }

      // 5. Convert Supadata offset (ms) to seconds & format timestamps
      const segments: ITranscriptSegment[] = content.map((item: any) => {
        const startSec = Math.max(0, (item.offset || 0) / 1000);
        const durSec = Math.max(0, (item.duration || 0) / 1000);
        const endSec = startSec + durSec;
        const m = Math.floor(startSec / 60);
        const s = Math.floor(startSec % 60);
        const timestamp = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return {
          start: Math.round(startSec * 10) / 10,
          end: Math.round(endSec * 10) / 10,
          timestamp,
          textOriginal: (item.text || '').trim(),
        };
      });

      const rawText = segments.map((s) => s.textOriginal).join(' ');
      const calculatedDuration =
        segments.length > 0 ? Math.ceil(segments[segments.length - 1].end) : durationSeconds;

      return {
        rawText,
        segments,
        durationSeconds: calculatedDuration,
        title,
        creatorName,
        thumbnailUrl,
      };
    } catch (err: any) {
      console.warn(`[InstagramTranscriberService] Supadata transcription error: ${err.message}`);
      return null;
    }
  }

  /**
   * Secondary Provider: Resolve direct media stream URL for the Reel
   * Tries session ID via ultra-igdl or RapidAPI
   */
  async resolveMediaAudioUrl(url: string): Promise<InstagramResolutionResult> {
    const shortcode = this.extractShortcode(url) || 'reel';
    const metadata = await this.fetchMetadata(url, shortcode);

    // Strategy 1: Check if INSTAGRAM_SESSION_ID is provided
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
          const videoItem =
            downloadResult.media.find((m: any) => m.type === 'video' || m.url?.includes('.mp4')) ||
            downloadResult.media[0];
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
        console.warn(`[InstagramTranscriberService] ultra-igdl resolution error: ${err.message}`);
      }
    }

    // Strategy 2: Check RapidAPI
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
            // Try next
          }
        }
      } catch (err: any) {
        console.warn(`[InstagramTranscriberService] RapidAPI error: ${err.message}`);
      }
    }

    return {
      requiresFallback: true,
      title: metadata.title,
      creatorName: metadata.creatorName,
      thumbnailUrl: metadata.thumbnailUrl,
      error:
        'Instagram restricts unauthenticated data-center extraction. Please drop the Reel video/audio below to transcribe in seconds.',
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
