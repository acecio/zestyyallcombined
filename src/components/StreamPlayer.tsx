import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, X, AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { Channel } from "@/lib/playlist";
import { getProxyUrl } from "@/lib/playlist";

interface Props {
  channel: Channel;
  useProxy: boolean;
  onClose: () => void;
}

/* ─── Strategy list ─────────────────────────────────────────── */
type Strategy = "hls-direct" | "hls-proxy" | "mpegts-direct" | "mpegts-proxy" | "native-direct";

function getStrategies(url: string): Strategy[] {
  const u = url.toLowerCase().split("?")[0];
  const isHttp = url.startsWith("http://");
  const isM3u8 = u.endsWith(".m3u8") || u.includes(".m3u8");
  const isTs = u.endsWith(".ts") || u.endsWith(".mpegts") || u.endsWith(".m2ts") || u.endsWith(".flv");

  if (isTs) {
    return isHttp
      ? ["mpegts-proxy", "mpegts-direct", "hls-proxy", "hls-direct"]
      : ["mpegts-direct", "mpegts-proxy", "hls-direct", "hls-proxy"];
  }
  if (isM3u8) {
    return isHttp
      ? ["hls-proxy", "hls-direct", "native-direct", "mpegts-proxy"]
      : ["hls-direct", "hls-proxy", "native-direct", "mpegts-direct"];
  }
  // Unknown URL (most IPTV): HLS is most common
  return isHttp
    ? ["hls-proxy", "hls-direct", "mpegts-proxy", "mpegts-direct", "native-direct"]
    : ["hls-direct", "hls-proxy", "mpegts-direct", "mpegts-proxy", "native-direct"];
}

function resolveUrl(strategy: Strategy, rawUrl: string, proxyUrl: string): string {
  return strategy.endsWith("-proxy") ? proxyUrl : rawUrl;
}

const STALL_CHECK_MS = 10_000;
const STALL_THRESHOLD_S = 0.5;

export const StreamPlayer = ({ channel, useProxy, onClose }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<ReturnType<typeof mpegts.createPlayer> | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTimeRef = useRef<number>(-1);
  const playedSecondsRef = useRef<number>(0);
  const strategyIdxRef = useRef<number>(0);
  const succeededRef = useRef<boolean>(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState("Connecting…");
  const [attempt, setAttempt] = useState(0);
  const [currentStrategyDisplay, setCurrentStrategyDisplay] = useState<Strategy>("hls-direct");

  const strategies = getStrategies(channel.url);
  const proxyUrl = getProxyUrl(channel.url);

  const stopStallTimer = useCallback(() => {
    if (stallTimerRef.current) {
      clearInterval(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const destroyHls = useCallback(() => {
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
  }, []);

  const destroyMpegts = useCallback(() => {
    if (mpegtsRef.current) {
      try {
        mpegtsRef.current.pause();
        mpegtsRef.current.unload();
        mpegtsRef.current.detachMediaElement();
        mpegtsRef.current.destroy();
      } catch { /* noop */ }
      mpegtsRef.current = null;
    }
  }, []);

  const fullCleanup = useCallback((video: HTMLVideoElement) => {
    stopStallTimer();
    destroyHls();
    destroyMpegts();
    video.removeAttribute("src");
    video.load();
  }, [stopStallTimer, destroyHls, destroyMpegts]);

  const startStallTimer = useCallback((video: HTMLVideoElement, recoverFn: () => void) => {
    stopStallTimer();
    lastTimeRef.current = video.currentTime;
    stallTimerRef.current = setInterval(() => {
      const cur = video.currentTime;
      const advanced = cur - lastTimeRef.current;
      const isStalled = !video.paused && !video.ended && advanced < STALL_THRESHOLD_S;
      if (isStalled && playedSecondsRef.current > 2) {
        recoverFn();
      }
      if (!video.paused) playedSecondsRef.current += STALL_CHECK_MS / 1000;
      lastTimeRef.current = cur;
    }, STALL_CHECK_MS);
  }, [stopStallTimer]);

  const tryNextStrategy = useCallback((video: HTMLVideoElement) => {
    strategyIdxRef.current += 1;
    if (strategyIdxRef.current >= strategies.length) {
      setError("Stream failed to load. It may be offline, geo-blocked, or unsupported.");
      setLoading(false);
      setStatusMsg("");
      return;
    }
    const next = strategies[strategyIdxRef.current];
    setStatusMsg(`Trying fallback ${strategyIdxRef.current + 1}/${strategies.length}…`);
    setTimeout(() => {
      fullCleanup(video);
      setAttempt((a) => a + 1);
    }, 800);
  }, [strategies, fullCleanup]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    succeededRef.current = false;
    playedSecondsRef.current = 0;
    lastTimeRef.current = -1;

    const stratIdx = strategyIdxRef.current;
    const strategy = strategies[Math.min(stratIdx, strategies.length - 1)];
    const url = resolveUrl(strategy, channel.url, proxyUrl);
    setCurrentStrategyDisplay(strategy);

    setError(null);
    setLoading(true);
    if (stratIdx === 0) setStatusMsg("Connecting…");

    const onPlaying = () => {
      succeededRef.current = true;
      setLoading(false);
      setStatusMsg("");
    };
    const onWaiting = () => { if (succeededRef.current) setStatusMsg("Buffering…"); };
    const onCanPlay = () => { if (succeededRef.current) setStatusMsg(""); };
    const onVideoError = () => { if (!succeededRef.current) tryNextStrategy(video); };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("error", onVideoError);

    const setupHls = () => {
      if (!Hls.isSupported()) {
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = url;
          video.play().catch(() => {});
          return;
        }
        tryNextStrategy(video);
        return;
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 90,
        maxBufferSize: 60 * 1000 * 1000,
        manifestLoadingMaxRetry: 3,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 3,
        levelLoadingRetryDelay: 1000,
        fragLoadingMaxRetry: 4,
        fragLoadingRetryDelay: 500,
        startLevel: -1,
        autoStartLoad: true,
        abrEwmaDefaultEstimate: 1_000_000,
      });

      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        startStallTimer(video, () => {
          if (hlsRef.current) {
            hlsRef.current.startLoad();
            video.play().catch(() => {});
          }
        });
      });

      let fatalRetries = 0;
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) {
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          return;
        }
        fatalRetries++;
        if (fatalRetries <= 2) {
          setStatusMsg(`Reconnecting… (${fatalRetries}/2)`);
          setTimeout(() => {
            if (!hlsRef.current) return;
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
            else hls.recoverMediaError();
            video.play().catch(() => {});
          }, 1500 * fatalRetries);
        } else {
          if (!succeededRef.current) tryNextStrategy(video);
        }
      });
    };

    const setupMpegts = () => {
      if (!mpegts.getFeatureList().mseLivePlayback) {
        tryNextStrategy(video);
        return;
      }
      const player = mpegts.createPlayer(
        { type: "mpegts", isLive: true, url },
        {
          enableWorker: true,
          enableStashBuffer: true,
          stashInitialSize: 384,
          liveBufferLatencyChasing: true,
          liveBufferLatencyMaxLatency: 12,
          liveBufferLatencyMinRemain: 2,
          autoCleanupSourceBuffer: true,
          autoCleanupMaxBackwardDuration: 10,
        }
      );
      mpegtsRef.current = player;
      player.attachMediaElement(video);
      player.load();
      Promise.resolve(player.play()).catch(() => {});

      startStallTimer(video, () => {
        if (mpegtsRef.current) {
          try { mpegtsRef.current.unload(); mpegtsRef.current.load(); Promise.resolve(mpegtsRef.current.play()).catch(() => {}); }
          catch { /* noop */ }
        }
      });

      let mpegtsRetries = 0;
      player.on(mpegts.Events.ERROR, () => {
        if (!succeededRef.current) {
          mpegtsRetries++;
          if (mpegtsRetries > 2) tryNextStrategy(video);
        }
      });
    };

    const setupNative = () => {
      video.src = url;
      video.play().catch(() => { if (!succeededRef.current) tryNextStrategy(video); });
    };

    if (strategy === "native-direct") setupNative();
    else if (strategy.startsWith("mpegts")) setupMpegts();
    else setupHls();

    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("error", onVideoError);
      fullCleanup(video);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const retry = () => {
    strategyIdxRef.current = 0;
    setError(null);
    setLoading(true);
    setStatusMsg("Connecting…");
    setAttempt((a) => a + 1);
  };

  const copyUrl = async () => {
    await navigator.clipboard.writeText(channel.url);
    toast.success("Stream URL copied");
  };

  const isProxy = currentStrategyDisplay?.endsWith("-proxy");
  const kindLabel = currentStrategyDisplay?.startsWith("mpegts") ? "MPEG-TS" : "HLS";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm p-2 sm:p-6 animate-fade-up">
      <div className="relative w-full max-w-5xl bg-gradient-card border border-border rounded-xl overflow-hidden shadow-card">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="live-dot" />
              <span className="text-xs font-bold tracking-widest text-accent">LIVE</span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                · {kindLabel}{isProxy ? " · PROXY" : " · DIRECT"}
              </span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl truncate">{channel.name}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close player">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="relative aspect-video bg-black">
          <video ref={videoRef} controls playsInline autoPlay className="absolute inset-0 h-full w-full" />
          {(loading || statusMsg) && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-3">
              {loading && <div className="h-12 w-12 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />}
              {statusMsg && (
                <p className="text-xs text-white/70 font-bold uppercase tracking-widest bg-black/50 px-3 py-1 rounded-full">
                  {statusMsg}
                </p>
              )}
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center bg-black/80">
              <AlertTriangle className="h-10 w-10 text-accent" />
              <p className="text-sm text-foreground/90 max-w-md">{error}</p>
              <div className="flex gap-2">
                <Button variant="default" size="sm" onClick={retry} className="bg-gradient-gold text-primary-foreground">
                  <RotateCcw className="h-4 w-4 mr-2" /> Retry
                </Button>
                <a href={`vlc://${channel.url}`}>
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-4 w-4 mr-2" /> Open in VLC
                  </Button>
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 p-4 border-t border-border">
          <Button variant="secondary" size="sm" onClick={retry}>
            <RotateCcw className="h-4 w-4 mr-2" /> Reload
          </Button>
          <Button variant="secondary" size="sm" onClick={copyUrl}>
            <Copy className="h-4 w-4 mr-2" /> Copy URL
          </Button>
          <a href={`vlc://${channel.url}`}>
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" /> VLC
            </Button>
          </a>
          <span className="ml-auto text-xs text-muted-foreground">
            {isProxy ? "Routed via proxy" : "Direct"}
          </span>
        </div>
      </div>
    </div>
  );
};
