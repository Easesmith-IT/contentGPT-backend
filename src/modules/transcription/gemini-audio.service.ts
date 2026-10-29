import fs from 'fs';

export interface EnrichedTranscriptData {
  cleanText: {
    original: string;
    english: string;
    hinglish: string;
  };
  summary: string[];
  keyQuotes: string[];
  suggestedAngles: string[];
}

export interface GeneratedScriptResult {
  format: 'SHORT' | 'LONG';
  title: string;
  estimatedDuration: string;
  wordCount: number;
  hookOptions?: { id: number; type: string; hook: string }[];
  scriptText: string;
  visualNotes?: string[];
  chapterMarkers?: { timestamp: string; title: string }[];
}

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

export class GeminiAudioService {
  private async getClient(): Promise<any | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      return null;
    }
    try {
      // Dynamic import for ESM package compatibility in CommonJS
      const genai = await (eval('import("@google/genai")') as Promise<any>);
      return new genai.GoogleGenAI({ apiKey: apiKey.trim() });
    } catch (err: any) {
      console.warn(`[GeminiAudioService] Could not load @google/genai: ${err.message}`);
      return null;
    }
  }

  /**
   * Structure raw transcript into English, Hinglish, Hindi + Summaries + Quotes
   */
  async enrichTranscript(rawText: string, videoTitle?: string): Promise<EnrichedTranscriptData> {
    const ai = await this.getClient();

    // Fallback if no Gemini API key configured
    if (!ai) {
      return this.buildHeuristicEnrichment(rawText, videoTitle);
    }

    try {
      const prompt = `You are an elite Indian sports content analyst and scriptwriter for "NISHIGPT".
Analyze this sports video transcript:
VIDEO TITLE: ${videoTitle || 'Sports Video'}
RAW TRANSCRIPT:
"""${rawText.slice(0, 10000)}"""

Perform the following tasks and return strictly valid JSON matching this schema:
{
  "english": "A clean, punctuated, professional English reading version with all filler words removed",
  "hinglish": "A natural, high-energy Hinglish version (Hindi words in English/Latin script, commonly spoken in Indian cricket/football YouTube channels like Sports Tak or Cricbuzz)",
  "hindi": "Natural Devanagari Hindi translation/transcription if applicable, or high-quality Devanagari Hindi version",
  "summary": ["Point 1 (Key match event or statement)", "Point 2 (Analysis or tactical detail)", "Point 3 (Implication or consequence)", "Point 4 (Fan or team reaction)"],
  "keyQuotes": ["Exact or near-exact quote with speaker name if known", "Second notable quote"],
  "suggestedAngles": ["Contrarian debate angle for a YouTube Short", "Stat or comparison angle", "Tactical breakdown angle"]
}

Strict requirements:
- Keep Indian player names, tournaments (IPL, WPL, ISL, Ranji), and cricket/football terms accurate.
- Return ONLY the JSON object, no markdown code fence ticks.`;

      const response = await ai.models.generateContent({
        model: DEFAULT_GEMINI_MODEL,
        contents: prompt,
      });

      const text = response.text || '';
      const cleanJsonStr = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJsonStr);

      return {
        cleanText: {
          original: rawText,
          english: parsed.english || rawText,
          hinglish: parsed.hinglish || rawText,
        },
        summary: Array.isArray(parsed.summary) && parsed.summary.length > 0 ? parsed.summary : [rawText.slice(0, 200)],
        keyQuotes: Array.isArray(parsed.keyQuotes) ? parsed.keyQuotes : [],
        suggestedAngles: Array.isArray(parsed.suggestedAngles) ? parsed.suggestedAngles : [],
      };
    } catch (err: any) {
      console.warn(`[GeminiAudioService] AI enrichment failed (${err.message}). Using fallback enrichment.`);
      return this.buildHeuristicEnrichment(rawText, videoTitle);
    }
  }

  /**
   * Transcribe an uploaded audio or video file via Gemini Multimodal File API
   */
  async transcribeMediaFile(filePath: string, mimeType: string): Promise<{
    rawText: string;
    segments: { start: number; end: number; timestamp: string; speaker: string; textOriginal: string }[];
  }> {
    const ai = await this.getClient();
    if (!ai) {
      throw new Error('Google Gemini API Key is not configured. Please add GEMINI_API_KEY to enable audio file transcription.');
    }

    try {
      // 1. Upload audio/video file using Gemini File API (file path as string)
      const fileUpload = await ai.files.upload({
        file: filePath,
        mimeType,
      });

      console.log(`[GeminiAudioService] File uploaded: ${fileUpload.name}. Requesting transcription...`);

      // 2. Transcribe using gemini-1.5-flash
      const prompt = `Transcribe this sports audio recording word-for-word.
Format your output as a strictly valid JSON array of timestamped segments:
[
  {
    "start": 0.0,
    "end": 4.5,
    "timestamp": "00:00",
    "speaker": "Speaker 1",
    "text": "Exact words spoken..."
  }
]
If there are multiple speakers (e.g. interviewer and player), differentiate them.
Do not omit words. Return ONLY the JSON array.`;

      const response = await ai.models.generateContent({
        model: DEFAULT_GEMINI_MODEL,
        contents: [fileUpload, prompt],
      });

      const responseText = (response.text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(responseText);

      const segments = Array.isArray(parsed)
        ? parsed.map((s: any) => ({
            start: Number(s.start) || 0,
            end: Number(s.end) || 0,
            timestamp: s.timestamp || '00:00',
            speaker: s.speaker || 'Speaker',
            textOriginal: s.text || '',
          }))
        : [];

      const rawText = segments.map((s) => s.textOriginal).join(' ');

      // Cleanup remote file after processing
      try {
        if (fileUpload.name) {
          await ai.files.delete({ name: fileUpload.name });
        }
      } catch {
        // Ignore file delete errors
      }

      return { rawText, segments };
    } catch (err: any) {
      throw new Error(`Gemini audio transcription failed: ${err.message}`);
    }
  }

  /**
   * Generate a 30-60s Short or 3-5m YouTube Script based on transcript
   */
  async generateScriptDraft(options: {
    transcript: string;
    format: 'SHORT' | 'LONG';
    videoTitle?: string;
    creatorNotes?: string;
  }): Promise<GeneratedScriptResult> {
    const ai = await this.getClient();
    const { transcript, format, videoTitle } = options;

    if (!ai) {
      // Fallback script if no API key
      return {
        format,
        title: videoTitle || 'Draft Script',
        estimatedDuration: format === 'SHORT' ? '45s' : '4m 30s',
        wordCount: format === 'SHORT' ? 140 : 650,
        hookOptions: [
          { id: 1, type: 'Contrarian', hook: `Did everyone completely miss what happened here?` },
          { id: 2, type: 'Stat', hook: `This one decision changed everything in the match.` },
          { id: 3, type: 'Story', hook: `Behind the scenes, here is the real truth.` },
        ],
        scriptText: `[HOOK]\nDid everyone completely miss what happened here?\n\n[BODY]\n${transcript.slice(0, 400)}...\n\n[CTA]\nDrop your prediction in the comments and subscribe to NISHIGPT!`,
      };
    }

    if (format === 'SHORT') {
      const prompt = `You are a viral YouTube Shorts and Instagram Reels sports scriptwriter for "NISHIGPT".
Write a high-retention 30–60 second vertical video script (130–160 words max) based on this transcript:
TOPIC: ${videoTitle || 'Sports News'}
TRANSCRIPT:
"""${transcript.slice(0, 6000)}"""

Return strictly valid JSON:
{
  "title": "Punchy Short Title (with #Shorts #Cricket / #Football)",
  "estimatedDuration": "45s",
  "wordCount": 145,
  "hookOptions": [
    { "id": 1, "type": "Contrarian Hook", "hook": "Bold, scroll-stopping question or hot take (under 8 words)" },
    { "id": 2, "type": "Stat / Fact Hook", "hook": "Surprising number or stat hook" },
    { "id": 3, "type": "Story Hook", "hook": "Narrative hook creating immediate curiosity" }
  ],
  "visualNotes": [
    "[0:00-0:03] Fast cut to match footage / dramatic photo of player",
    "[0:03-0:20] Talking head to camera with bold on-screen caption",
    "[0:20-0:40] Split-screen B-roll showing scoreboard or press quote",
    "[0:40-0:45] Zoom in for CTA"
  ],
  "scriptText": "Full word-for-word spoken script formatted with [HOOK], [BEAT 1], [BEAT 2], [CLIMAX], [CALL TO ACTION]. Use energetic, conversational Indian sports phrasing."
}
Return ONLY valid JSON.`;

      const response = await ai.models.generateContent({
        model: DEFAULT_GEMINI_MODEL,
        contents: prompt,
      });

      const parsed = JSON.parse((response.text || '').replace(/```json/gi, '').replace(/```/g, '').trim());
      return {
        format: 'SHORT',
        title: parsed.title || 'Viral Short Script',
        estimatedDuration: parsed.estimatedDuration || '45s',
        wordCount: parsed.wordCount || 140,
        hookOptions: parsed.hookOptions,
        visualNotes: parsed.visualNotes,
        scriptText: parsed.scriptText,
      };
    } else {
      const prompt = `You are an expert sports video essayist and YouTube breakdown writer for "NISHIGPT".
Write a comprehensive 3–5 minute long-form YouTube script (600–750 words) with high retention structure based on this transcript:
TOPIC: ${videoTitle || 'Sports Breakdown'}
TRANSCRIPT:
"""${transcript.slice(0, 8000)}"""

Return strictly valid JSON:
{
  "title": "Compelling YouTube Video Title",
  "estimatedDuration": "4m 15s",
  "wordCount": 680,
  "chapterMarkers": [
    { "timestamp": "0:00", "title": "The Big Question" },
    { "timestamp": "0:45", "title": "What Really Happened" },
    { "timestamp": "1:50", "title": "The Tactical Breakdown" },
    { "timestamp": "3:10", "title": "The Future Impact" },
    { "timestamp": "4:00", "title": "Verdict & Outro" }
  ],
  "scriptText": "Complete script with chapter headers, retention resets, visual direction cues in brackets like [B-ROLL: ...], and interactive viewer questions. Conversational, authoritative Indian sports tone."
}
Return ONLY valid JSON.`;

      const response = await ai.models.generateContent({
        model: DEFAULT_GEMINI_MODEL,
        contents: prompt,
      });

      const parsed = JSON.parse((response.text || '').replace(/```json/gi, '').replace(/```/g, '').trim());
      return {
        format: 'LONG',
        title: parsed.title || 'YouTube Sports Breakdown',
        estimatedDuration: parsed.estimatedDuration || '4m 30s',
        wordCount: parsed.wordCount || 650,
        chapterMarkers: parsed.chapterMarkers,
        scriptText: parsed.scriptText,
      };
    }
  }

  /**
   * Simple deterministic heuristic fallback when Gemini API key is missing
   */
  private buildHeuristicEnrichment(rawText: string, videoTitle?: string): EnrichedTranscriptData {
    const sentences = rawText
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20);

    const summary = sentences.slice(0, 4);
    if (summary.length === 0) {
      summary.push(videoTitle || rawText.slice(0, 150));
    }

    const keyQuotes = sentences.filter((s) => s.includes('"') || s.length > 50).slice(0, 2);
    if (keyQuotes.length === 0 && sentences.length > 0) {
      keyQuotes.push(sentences[0]);
    }

    return {
      cleanText: {
        original: rawText,
        english: rawText,
        hinglish: rawText,
      },
      summary,
      keyQuotes,
      suggestedAngles: [
        'How this decision will impact the upcoming tournament fixtures',
        'Comparing this performance with historical stats',
        'The contrarian fan reaction on social media',
      ],
    };
  }
}
