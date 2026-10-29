import mongoose, { Schema, Document } from 'mongoose';

export interface ITranscriptSegment {
  start: number;          // In seconds (e.g. 15.4)
  end: number;            // In seconds (e.g. 19.8)
  timestamp: string;      // Formatted "MM:SS" or "HH:MM:SS"
  speaker?: string;       // E.g. "Rohit Sharma", "Speaker 1"
  textOriginal: string;   // Spoken language
  textEnglish?: string;   // English translation
  textHinglish?: string;  // Romanized Hinglish
}

export interface ITranscript extends Document {
  sourcePlatform: 'YOUTUBE' | 'INSTAGRAM' | 'UPLOAD';
  sourceUrl: string;
  videoId?: string;
  title: string;
  creatorName: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  segments: ITranscriptSegment[];
  cleanText: {
    original: string;
    english: string;
    hinglish: string;
  };
  summary: string[];
  keyQuotes: string[];
  suggestedAngles: string[];
  isSaved: boolean;       // Protected from auto-purge
  createdAt: Date;
  updatedAt: Date;
}

const TranscriptSegmentSchema = new Schema<ITranscriptSegment>(
  {
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    timestamp: { type: String, required: true },
    speaker: { type: String, default: 'Speaker 1' },
    textOriginal: { type: String, required: true },
    textEnglish: { type: String, default: '' },
    textHinglish: { type: String, default: '' },
  },
  { _id: false }
);

const TranscriptSchema = new Schema<ITranscript>(
  {
    sourcePlatform: {
      type: String,
      required: true,
      enum: ['YOUTUBE', 'INSTAGRAM', 'UPLOAD'],
      index: true,
    },
    sourceUrl: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    videoId: {
      type: String,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      default: 'Untitled Sports Video',
    },
    creatorName: {
      type: String,
      required: true,
      default: 'Sports Creator',
      trim: true,
    },
    thumbnailUrl: {
      type: String,
      trim: true,
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    segments: [TranscriptSegmentSchema],
    cleanText: {
      original: { type: String, default: '' },
      english: { type: String, default: '' },
      hinglish: { type: String, default: '' },
    },
    summary: [{ type: String }],
    keyQuotes: [{ type: String }],
    suggestedAngles: [{ type: String }],
    isSaved: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for quick sorting & retrieval
TranscriptSchema.index({ createdAt: -1, isSaved: 1 });

export const Transcript = mongoose.model<ITranscript>('Transcript', TranscriptSchema);
