import mongoose, { Schema, Document } from 'mongoose';

export type ChannelPlatform = 'YOUTUBE' | 'INSTAGRAM' | 'RSS';

export interface IMonitoredChannel extends Document {
  platform: ChannelPlatform;
  channelName: string;
  channelUrl: string;
  platformChannelId?: string;
  priorityWeight: number; // 1.0 (Standard) to 3.0 (VIP Priority)
  category: string;
  autoTranscribe: boolean;
  lastPolledAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MonitoredChannelSchema = new Schema<IMonitoredChannel>(
  {
    platform: {
      type: String,
      required: true,
      enum: ['YOUTUBE', 'INSTAGRAM', 'RSS'],
      index: true,
    },
    channelName: {
      type: String,
      required: true,
      trim: true,
    },
    channelUrl: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    platformChannelId: {
      type: String,
      trim: true,
    },
    priorityWeight: {
      type: Number,
      default: 2.0,
      min: 1.0,
      max: 5.0,
    },
    category: {
      type: String,
      default: 'sports',
    },
    autoTranscribe: {
      type: Boolean,
      default: false,
    },
    lastPolledAt: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const MonitoredChannel = mongoose.model<IMonitoredChannel>('MonitoredChannel', MonitoredChannelSchema);
