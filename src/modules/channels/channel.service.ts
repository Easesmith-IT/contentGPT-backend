import { MonitoredChannel, IMonitoredChannel, ChannelPlatform } from '../../models/MonitoredChannel';
import { YoutubeSourceAdapter } from '../sources/youtube.adapter';

export interface CreateChannelDTO {
  platform: ChannelPlatform;
  channelName: string;
  channelUrl: string;
  priorityWeight?: number;
  category?: string;
  autoTranscribe?: boolean;
}

export class ChannelService {
  private youtubeAdapter = new YoutubeSourceAdapter();

  async getAllChannels(): Promise<IMonitoredChannel[]> {
    return MonitoredChannel.find().sort({ priorityWeight: -1, createdAt: -1 });
  }

  async addChannel(dto: CreateChannelDTO): Promise<IMonitoredChannel> {
    let platformChannelId: string | undefined;

    // Auto-resolve YouTube channel ID if applicable
    if (dto.platform === 'YOUTUBE') {
      const resolved = await this.youtubeAdapter.resolveChannelId(dto.channelUrl);
      if (resolved) {
        platformChannelId = resolved;
      }
    }

    const channel = await MonitoredChannel.create({
      ...dto,
      platformChannelId,
      priorityWeight: dto.priorityWeight || 2.0,
      isActive: true,
    });

    return channel;
  }

  async updateChannel(id: string, updates: Partial<IMonitoredChannel>): Promise<IMonitoredChannel | null> {
    return MonitoredChannel.findByIdAndUpdate(id, updates, { new: true });
  }

  async deleteChannel(id: string): Promise<boolean> {
    const res = await MonitoredChannel.findByIdAndDelete(id);
    return !!res;
  }
}
