import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { Transcript } from '../models/Transcript';
import { YouTubeTranscriberService } from '../modules/transcription/youtube-transcriber.service';
import { InstagramTranscriberService } from '../modules/transcription/instagram-transcriber.service';
import { GeminiAudioService } from '../modules/transcription/gemini-audio.service';

const upload = multer({
  dest: path.join(os.tmpdir(), 'contentgpt-uploads'),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

export function createTranscriptRouter(): Router {
  const router = Router();
  const ytService = new YouTubeTranscriberService();
  const igService = new InstagramTranscriberService();
  const geminiService = new GeminiAudioService();

  // POST /api/v1/transcripts/link - Transcribe YouTube or Instagram URL
  router.post('/link', async (req: Request, res: Response) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({ success: false, error: 'A valid video URL is required.' });
      }

      const cleanUrl = url.trim();

      // 1. Check if URL is YouTube (100% free direct subtitle extraction; Supadata is NOT used here)
      const ytVideoId = ytService.extractVideoId(cleanUrl);
      if (ytVideoId) {
        // Check if transcript already exists in DB for this video
        const existing = await Transcript.findOne({ videoId: ytVideoId });
        if (existing) {
          return res.json({
            success: true,
            data: existing,
            cached: true,
            message: 'Retrieved from Transcript Library.',
          });
        }

        const meta = await ytService.fetchMetadata(ytVideoId);

        try {
          // Direct caption extraction
          const captionResult = await ytService.extractCaptions(ytVideoId);

          // AI enrichment (Summary, Quotes, Hinglish, English)
          const enriched = await geminiService.enrichTranscript(captionResult.rawText, meta.title);

          const transcriptDoc = await Transcript.create({
            sourcePlatform: 'YOUTUBE',
            sourceUrl: `https://www.youtube.com/watch?v=${ytVideoId}`,
            videoId: ytVideoId,
            title: meta.title,
            creatorName: meta.creatorName,
            thumbnailUrl: meta.thumbnailUrl,
            durationSeconds: captionResult.durationSeconds,
            segments: captionResult.segments,
            cleanText: enriched.cleanText,
            summary: enriched.summary,
            keyQuotes: enriched.keyQuotes,
            suggestedAngles: enriched.suggestedAngles,
            isSaved: false,
          });

          return res.json({
            success: true,
            data: transcriptDoc,
            cached: false,
            message: 'Successfully transcribed YouTube video!',
          });
        } catch (ytErr: any) {
          return res.status(422).json({
            success: false,
            error: ytErr.message || 'Could not extract subtitles for this YouTube video.',
            requiresUploadFallback: true,
            metadata: meta,
          });
        }
      }

      // 2. Check if URL is Instagram (Supadata is used EXCLUSIVELY for Instagram Reels to conserve API credits)
      const igShortcode = igService.extractShortcode(cleanUrl);
      if (igShortcode) {
        const existing = await Transcript.findOne({ videoId: igShortcode });
        if (existing) {
          return res.json({
            success: true,
            data: existing,
            cached: true,
            message: 'Retrieved from Transcript Library.',
          });
        }

        // STEP 1: Attempt direct transcription with Supadata (Primary Provider)
        try {
          const supaResult = await igService.transcribeWithSupadata(cleanUrl, igShortcode);
          if (supaResult && supaResult.rawText.trim()) {
            // AI enrichment with Gemini (Hinglish, English, summary, quotes, angles + segment translation)
            const [enriched, translatedSegments] = await Promise.all([
              geminiService.enrichTranscript(supaResult.rawText, supaResult.title),
              supaResult.segments && supaResult.segments.length > 0
                ? geminiService.translateSegments(supaResult.segments)
                : Promise.resolve(supaResult.segments),
            ]);

            const transcriptDoc = await Transcript.create({
              sourcePlatform: 'INSTAGRAM',
              sourceUrl: cleanUrl,
              videoId: igShortcode,
              title: supaResult.title,
              creatorName: supaResult.creatorName,
              thumbnailUrl: supaResult.thumbnailUrl,
              durationSeconds: supaResult.durationSeconds,
              segments: translatedSegments,
              cleanText: enriched.cleanText,
              summary: enriched.summary,
              keyQuotes: enriched.keyQuotes,
              suggestedAngles: enriched.suggestedAngles,
              isSaved: false,
            });

            return res.json({
              success: true,
              data: transcriptDoc,
              cached: false,
              message: 'Successfully transcribed Instagram Reel with Supadata & Gemini!',
            });
          }
        } catch (supaErr: any) {
          console.warn('[Supadata Direct Error]', supaErr.message);
        }

        // STEP 2: Secondary fallback: Direct stream resolution (ultra-igdl / RapidAPI) -> Gemini Multimodal
        const meta = await igService.fetchMetadata(cleanUrl, igShortcode);
        const mediaResolution = await igService.resolveMediaAudioUrl(cleanUrl);

        if (!mediaResolution.requiresFallback && mediaResolution.streamUrl) {
          try {
            const tmpPath = await igService.downloadStreamToTempFile(mediaResolution.streamUrl, igShortcode);
            let rawText = '';
            let segments: any[] = [];
            let durationSeconds = 0;

            try {
              const transResult = await geminiService.transcribeMediaFile(tmpPath, 'video/mp4');
              rawText = transResult.rawText;
              segments = transResult.segments;
              durationSeconds = segments.length > 0 ? Math.ceil(segments[segments.length - 1].end) : 0;
            } finally {
              if (fs.existsSync(tmpPath)) {
                fs.unlinkSync(tmpPath);
              }
            }

            if (rawText.trim()) {
              const enriched = await geminiService.enrichTranscript(rawText, mediaResolution.title || meta.title);

              const transcriptDoc = await Transcript.create({
                sourcePlatform: 'INSTAGRAM',
                sourceUrl: cleanUrl,
                videoId: igShortcode,
                title: mediaResolution.title || meta.title,
                creatorName: mediaResolution.creatorName || meta.creatorName,
                thumbnailUrl: mediaResolution.thumbnailUrl || meta.thumbnailUrl,
                durationSeconds,
                segments,
                cleanText: enriched.cleanText,
                summary: enriched.summary,
                keyQuotes: enriched.keyQuotes,
                suggestedAngles: enriched.suggestedAngles,
                isSaved: false,
              });

              return res.json({
                success: true,
                data: transcriptDoc,
                cached: false,
                message: 'Successfully transcribed Instagram Reel with Gemini 3.5 Flash!',
              });
            }
          } catch (streamErr: any) {
            console.error('[Instagram Stream Processing Error]', streamErr);
          }
        }

        // STEP 3: Fallback notice prompting 1-tap media upload
        return res.status(200).json({
          success: false,
          requiresUploadFallback: true,
          metadata: {
            title: mediaResolution.title || meta.title,
            creatorName: mediaResolution.creatorName || meta.creatorName,
            thumbnailUrl: mediaResolution.thumbnailUrl || meta.thumbnailUrl,
            shortcode: igShortcode,
          },
          message:
            'Could not extract audio directly from this Instagram link. Please use the 1-Tap Audio/Video Upload button below to transcribe it with Gemini in seconds!',
        });
      }

      return res.status(400).json({
        success: false,
        error: 'Unsupported URL. Please enter a valid YouTube video/Shorts link or Instagram Reel link.',
      });
    } catch (err: any) {
      console.error('[Transcript Route Error]', err);
      res.status(500).json({ success: false, error: err.message || 'Transcription failed.' });
    }
  });

  // POST /api/v1/transcripts/upload - Upload file fallback
  router.post('/upload', upload.single('mediaFile'), async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'No media file provided.' });
    }

    try {
      const title = (req.body.title as string) || file.originalname || 'Uploaded Media';
      const creatorName = (req.body.creatorName as string) || 'Creator Upload';
      const sourceUrl = (req.body.sourceUrl as string) || 'file://uploaded';

      // Transcribe via Gemini
      const { rawText, segments } = await geminiService.transcribeMediaFile(file.path, file.mimetype);

      // Clean up uploaded temp file
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      // Enrich transcript
      const enriched = await geminiService.enrichTranscript(rawText, title);

      const transcriptDoc = await Transcript.create({
        sourcePlatform: sourceUrl.includes('instagram.com') ? 'INSTAGRAM' : 'UPLOAD',
        sourceUrl,
        title,
        creatorName,
        durationSeconds: segments.length > 0 ? Math.ceil(segments[segments.length - 1].end) : 0,
        segments,
        cleanText: enriched.cleanText,
        summary: enriched.summary,
        keyQuotes: enriched.keyQuotes,
        suggestedAngles: enriched.suggestedAngles,
        isSaved: false,
      });

      res.json({
        success: true,
        data: transcriptDoc,
        message: 'Successfully transcribed uploaded media!',
      });
    } catch (err: any) {
      if (file && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/v1/transcripts/:id/generate-script - Script Studio Bridge
  router.post('/:id/generate-script', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { format = 'SHORT', creatorNotes } = req.body;

      const transcript = await Transcript.findById(id);
      if (!transcript) {
        return res.status(404).json({ success: false, error: 'Transcript not found.' });
      }

      const scriptResult = await geminiService.generateScriptDraft({
        transcript: transcript.cleanText.original || transcript.segments.map((s) => s.textOriginal).join(' '),
        format: format === 'LONG' ? 'LONG' : 'SHORT',
        videoTitle: transcript.title,
        creatorNotes,
      });

      res.json({
        success: true,
        data: scriptResult,
        message: `Drafted ${format === 'SHORT' ? '30-60s Short' : '3-5 min Breakdown'} script successfully!`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/v1/transcripts/:id/translate - Translate transcript into English & Hinglish
  router.post('/:id/translate', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const transcript = await Transcript.findById(id);
      if (!transcript) {
        return res.status(404).json({ success: false, error: 'Transcript not found.' });
      }

      const raw =
        transcript.cleanText.original ||
        transcript.segments.map((s) => s.textOriginal).join(' ');

      const [translations, translatedSegments] = await Promise.all([
        geminiService.translateTranscript(raw),
        transcript.segments && transcript.segments.length > 0
          ? geminiService.translateSegments(transcript.segments as any)
          : Promise.resolve([]),
      ]);

      transcript.cleanText.english = translations.english;
      transcript.cleanText.hinglish = translations.hinglish;
      if (translatedSegments && translatedSegments.length > 0) {
        transcript.segments = translatedSegments as any;
      }

      await transcript.save();

      res.json({
        success: true,
        data: transcript,
        message: 'Successfully translated transcript into English and Hinglish with Gemini!',
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/v1/transcripts - List history
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { page = '1', limit = '10', platform, isSaved, search } = req.query;
      const query: any = {};

      if (platform && platform !== 'ALL') {
        query.sourcePlatform = platform;
      }
      if (typeof isSaved === 'string') {
        query.isSaved = isSaved === 'true';
      }
      if (search && typeof search === 'string' && search.trim()) {
        const regex = new RegExp(search.trim(), 'i');
        query.$or = [{ title: regex }, { creatorName: regex }, { 'cleanText.original': regex }];
      }

      const pageNum = parseInt(page as string, 10) || 1;
      const limitNum = parseInt(limit as string, 10) || 10;

      const total = await Transcript.countDocuments(query);
      const items = await Transcript.find(query)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .select('-segments'); // Exclude detailed segments in list view for performance

      res.json({
        success: true,
        data: {
          items,
          total,
          page: pageNum,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/v1/transcripts/:id - Full details
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const transcript = await Transcript.findById(id);
      if (!transcript) {
        return res.status(404).json({ success: false, error: 'Transcript not found.' });
      }
      res.json({ success: true, data: transcript });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/v1/transcripts/:id/save - Toggle vault bookmark
  router.patch('/:id/save', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { isSaved } = req.body;
      const transcript = await Transcript.findById(id);
      if (!transcript) {
        return res.status(404).json({ success: false, error: 'Transcript not found.' });
      }

      transcript.isSaved = typeof isSaved === 'boolean' ? isSaved : !transcript.isSaved;
      await transcript.save();

      res.json({
        success: true,
        data: transcript,
        message: transcript.isSaved ? 'Saved to Vault' : 'Removed from Vault',
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/v1/transcripts/:id
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const result = await Transcript.findByIdAndDelete(id);
      if (!result) {
        return res.status(404).json({ success: false, error: 'Transcript not found.' });
      }
      res.json({ success: true, message: 'Transcript deleted.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
