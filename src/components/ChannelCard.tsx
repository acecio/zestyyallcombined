import { Play, Tv } from "lucide-react";
import type { Channel } from "@/lib/playlist";

interface Props {
  channel: Channel;
  onPlay: (c: Channel) => void;
}

export const ChannelCard = ({ channel, onPlay }: Props) => {
  return (
    <button
      onClick={() => onPlay(channel)}
      className="group relative text-left bg-gradient-card border border-border rounded-xl overflow-hidden shadow-card hover:border-primary/60 transition-all hover:-translate-y-1 hover:shadow-glow"
    >
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-accent/90 backdrop-blur">
        <span className="live-dot" />
        <span className="text-[10px] font-bold tracking-widest text-accent-foreground">LIVE</span>
      </div>

      <div className="relative aspect-[4/3] flex items-center justify-center bg-secondary/40 p-6">
        {channel.logo ? (
          <img
            src={channel.logo}
            alt={channel.name}
            loading="lazy"
            className="max-h-24 max-w-full object-contain drop-shadow-[0_4px_18px_rgba(0,0,0,0.5)]"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <Tv className="h-16 w-16 text-muted-foreground" />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="bg-gradient-gold rounded-full p-4 shadow-glow">
            <Play className="h-7 w-7 text-primary-foreground fill-primary-foreground" />
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-border">
        <p className="font-semibold text-sm truncate">{channel.name}</p>
        <p className="text-xs text-muted-foreground truncate">{channel.group}</p>
      </div>
    </button>
  );
};
