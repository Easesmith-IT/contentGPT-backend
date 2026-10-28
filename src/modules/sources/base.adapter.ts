import { SourcePlatform } from '../../models/ResearchItem';

export interface ScrapedItem {
  sourcePlatform: SourcePlatform;
  sourceUrl: string;
  title: string;
  contentSnippet: string;
  fullText?: string;
  authorOrChannel: string;
  publishedAt: Date;
  engagementMetrics?: {
    upvotes?: number;
    comments?: number;
    views?: number;
  };
  isPrioritySource?: boolean;
  priorityWeight?: number;
  channelId?: any;
}

export interface BaseSourceAdapter {
  platformName: SourcePlatform;
  fetchLatest(limit?: number): Promise<ScrapedItem[]>;
}
