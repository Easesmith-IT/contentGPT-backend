import mongoose, { Schema, Document } from 'mongoose';

export type SourcePlatform = 'YOUTUBE' | 'INSTAGRAM' | 'RSS_NEWS' | 'REDDIT' | 'GOOGLE';

export interface IResearchItem extends Document {
  sourcePlatform: SourcePlatform;
  sourceUrl: string;
  title: string;
  contentSnippet: string;
  fullText?: string;
  authorOrChannel: string;
  channelId?: mongoose.Types.ObjectId;
  isPrioritySource: boolean;
  priorityWeight: number;
  engagementMetrics?: {
    upvotes?: number;
    comments?: number;
    views?: number;
  };
  isSaved: boolean; // Protected from 14-day auto purge when true
  savedAt?: Date | null;
  publishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ResearchItemSchema = new Schema<IResearchItem>(
  {
    sourcePlatform: {
      type: String,
      required: true,
      enum: ['YOUTUBE', 'INSTAGRAM', 'RSS_NEWS', 'REDDIT', 'GOOGLE'],
      index: true,
    },
    sourceUrl: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    contentSnippet: {
      type: String,
      required: true,
    },
    fullText: {
      type: String,
    },
    authorOrChannel: {
      type: String,
      required: true,
      default: 'Unknown Source',
      index: true,
    },
    channelId: {
      type: Schema.Types.ObjectId,
      ref: 'MonitoredChannel',
    },
    isPrioritySource: {
      type: Boolean,
      default: false,
      index: true,
    },
    priorityWeight: {
      type: Number,
      default: 1.0,
    },
    engagementMetrics: {
      upvotes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      views: { type: Number, default: 0 },
    },
    isSaved: {
      type: Boolean,
      default: false,
      index: true,
    },
    savedAt: {
      type: Date,
      default: null,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient date + saved queries
ResearchItemSchema.index({ createdAt: -1, isSaved: 1 });
ResearchItemSchema.index({ publishedAt: -1 });

export const ResearchItem = mongoose.model<IResearchItem>('ResearchItem', ResearchItemSchema);
