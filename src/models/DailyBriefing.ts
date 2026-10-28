import mongoose, { Schema, Document } from 'mongoose';

export type BriefingSlot = 'MORNING_9AM' | 'EVENING_8PM' | 'MANUAL';

export interface IBriefingStory {
  storyId: string;
  headline: string;
  summary: string;
  viralScore: number;
  sourceLinks: string[];
  fanDebateAngle: string;
  hookOptions: {
    id: number;
    type: string;
    text: string;
  }[];
  quickShortScript: string;
  relatedResearchItemIds: mongoose.Types.ObjectId[];
}

export interface IDailyBriefing extends Document {
  briefingDate: string; // 'YYYY-MM-DD'
  briefingSlot: BriefingSlot;
  headlineSummary: string;
  topStories: IBriefingStory[];
  isSaved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DailyBriefingSchema = new Schema<IDailyBriefing>(
  {
    briefingDate: {
      type: String,
      required: true,
      index: true,
    },
    briefingSlot: {
      type: String,
      required: true,
      enum: ['MORNING_9AM', 'EVENING_8PM', 'MANUAL'],
      index: true,
    },
    headlineSummary: {
      type: String,
      required: true,
    },
    topStories: [
      {
        storyId: { type: String, required: true },
        headline: { type: String, required: true },
        summary: { type: String, required: true },
        viralScore: { type: Number, default: 50 },
        sourceLinks: [{ type: String }],
        fanDebateAngle: { type: String },
        hookOptions: [
          {
            id: { type: Number },
            type: { type: String },
            text: { type: String },
          },
        ],
        quickShortScript: { type: String },
        relatedResearchItemIds: [{ type: Schema.Types.ObjectId, ref: 'ResearchItem' }],
      },
    ],
    isSaved: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

DailyBriefingSchema.index({ briefingDate: -1, briefingSlot: 1 });

export const DailyBriefing = mongoose.model<IDailyBriefing>('DailyBriefing', DailyBriefingSchema);
