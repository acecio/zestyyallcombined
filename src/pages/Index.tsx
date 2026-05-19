import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, ExternalLink } from "lucide-react";
import { ChannelCard } from "@/components/ChannelCard";
import { StreamPlayer } from "@/components/StreamPlayer";
import { parseM3U, type Channel } from "@/lib/playlist";

const PLAYLISTS = [
  {
    id: "1",
    label: "1",
    url: "https://raw.githubusercontent.com/ashik4u/mrgify-clean/27e0396a65e3c05017619305945bc133c678dab6/playlist.m3u",
  },
  {
    id: "2",
    label: "2",
    url: "https://raw.githubusercontent.com/sportlive18/IPL-M3U-Playlist/refs/heads/main/IPL.m3u",
  },
];

/* ─── helpers ──────────────────────────────────────────────── */
const HighlightText = ({
  text,
  highlight,
}: {
  text: string;
  highlight: string;
}) => {
  if (!highlight.trim()) return <>{text}</>;
  const parts = text.split(
    new RegExp(
      `(${highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi"
    )
  );
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <span
            key={i}
            className="bg-red-600 text-white rounded-[2px] px-0.5 font-bold"
          >
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
};

/* ─── channel mini card (grid) ─────────────────────────────── */
function ChannelMiniCard({
  channel,
  searchTerm = "",
  onPlay,
}: {
  channel: Channel;
  searchTerm?: string;
  onPlay: (c: Channel) => void;
}) {
  return (
    <button
      onClick={() => onPlay(channel)}
      className="flex flex-col w-full text-left group bg-neutral-900/40 rounded-lg border border-white/5 hover:border-red-500/30 transition-all overflow-hidden p-3"
    >
      <div className="w-full aspect-video bg-neutral-950 rounded-md overflow-hidden relative mb-3">
        <div className="absolute inset-0 flex items-center justify-center p-3 bg-black/40 backdrop-blur-sm">
          {channel.logo ? (
            <img
              src={channel.logo}
              alt={channel.name}
              className="max-w-full max-h-[70%] object-contain drop-shadow-2xl group-hover:scale-110 transition-transform duration-500"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="font-black text-neutral-600 text-[10px] uppercase text-center leading-tight px-2">
              {channel.name}
            </div>
          )}
        </div>
        <span className="badge-live absolute top-1.5 right-1.5 z-10 text-[7px]">
          <span className="live-dot" />
          LIVE
        </span>
      </div>
      <h5 className="text-[11px] font-bold truncate text-white leading-tight">
        <HighlightText text={channel.name} highlight={searchTerm} />
      </h5>
      <p className="text-[8px] font-bold text-neutral-600 uppercase tracking-widest mt-0.5">
        <HighlightText text={channel.group || ""} highlight={searchTerm} />
      </p>
    </button>
  );
}

/* ─── main page ─────────────────────────────────────────────── */
const Index = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>("1");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<string>("");
  const [playing, setPlaying] = useState<Channel | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(40);

  const handlePlay = (ch: Channel) => navigate(`/channel/${ch.id}?pl=${activeTab}`);

  /* fetch playlist */
  useEffect(() => {
    const playlist = PLAYLISTS.find((p) => p.id === activeTab) || PLAYLISTS[0];
    setLoading(true);
    setLoadError(null);
    setChannels([]);
    setQuery("");
    setActiveGroup("");
    setVisibleCount(40);
    (async () => {
      try {
        const res = await fetch(playlist.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        setChannels(parseM3U(text));
      } catch (e) {
        setLoadError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [activeTab]);

  /* fullscreen listener */
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      playerRef.current?.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  };

  const handleCopy = () => {
    if (!playing) return;
    navigator.clipboard.writeText(playing.url ?? "").then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  /* derived */
  const groups = useMemo(() => {
    const set = new Set<string>();
    channels.forEach((c) => set.add(c.group));
    return Array.from(set).sort();
  }, [channels]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter((c) => {
      if (activeGroup && c.group !== activeGroup) return false;
      if (q && !c.name.toLowerCase().includes(q) && !c.group.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [channels, query, activeGroup]);

  const isSearching = query.trim().length > 0;

  // Reset visible count whenever filters change
  useEffect(() => { setVisibleCount(40); }, [query, activeGroup]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans flex flex-col selection:bg-red-600 selection:text-white">
      {/* ── Navigation ── */}
      <nav className="flex items-center justify-between px-4 sm:px-6 lg:px-12 py-4 sm:py-5 bg-gradient-to-b from-black/80 to-transparent absolute top-0 w-full z-30">
        <div className="flex items-center gap-6 sm:gap-10">
          <button
            onClick={() => {
              setQuery("");
              setActiveGroup("");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="flex items-center gap-2 text-red-600 cursor-pointer"
          >
            <span className="text-2xl sm:text-3xl font-black tracking-tighter uppercase italic">
              ZESTYY<span className="text-white">TV</span>
            </span>
          </button>
          <ul className="hidden md:flex gap-8 text-xs font-black tracking-widest text-neutral-400 uppercase">
            {groups.slice(0, 6).map((g) => (
              <li key={g}>
                <button
                  onClick={() => setActiveGroup(g)}
                  className={
                    activeGroup === g
                      ? "text-white"
                      : "hover:text-white transition-colors"
                  }
                >
                  {g}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-3">
          {/* Playlist tab switcher */}
          <div className="flex items-center bg-neutral-900/80 border border-white/10 rounded-lg p-1 gap-1">
            {PLAYLISTS.map((pl) => (
              <button
                key={pl.id}
                onClick={() => setActiveTab(pl.id)}
                className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === pl.id
                    ? "bg-red-600 text-white shadow shadow-red-600/30"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                {pl.label}
              </button>
            ))}
          </div>
          <a
            href="https://www.instagram.com/nikkk.exe"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-red-600 text-white text-[10px] font-black px-3 py-1.5 rounded shadow-lg shadow-red-600/20 uppercase tracking-tighter hover:bg-red-700 transition-colors"
          >
            <span>DEVELOPER</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>
        </div>
      </nav>

      {/* ── Main ── */}
      <main className="pt-24 px-4 sm:px-6 lg:px-12 pb-16 flex-1 flex flex-col max-w-[1800px] w-full mx-auto">

        {/* ── Player ── */}
        {playing && (
          <div className="flex flex-col gap-6 mb-10 w-full">
            <div
              ref={playerRef}
              className="w-full aspect-video bg-black rounded-xl overflow-hidden border border-white/10 relative shadow-2xl group"
            >
              <div className="absolute top-4 right-4 z-20 pointer-events-none opacity-20 text-white font-black tracking-widest text-lg select-none">
                zestyytv
              </div>
              <StreamPlayer
                channel={playing}
                useProxy={false}
                onClose={() => setPlaying(null)}
              />
              <button
                onClick={toggleFullscreen}
                className="absolute bottom-5 right-5 z-30 bg-black/70 hover:bg-black text-white px-4 py-2 rounded border border-white/20 text-xs font-bold uppercase tracking-wider backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </button>
            </div>

            {/* Title bar */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="badge-live">
                    <span className="live-dot" /> LIVE
                  </span>
                  <span className="text-[10px] font-bold text-neutral-300 uppercase tracking-[0.2em]">
                    {playing.group} · HD
                  </span>
                </div>
                <h1 className="text-3xl sm:text-5xl lg:text-7xl font-black uppercase leading-[0.85] tracking-tighter">
                  {playing.name}
                </h1>
              </div>
            </div>

            {/* URL bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-900/40 border border-white/5 p-3 rounded-lg">
              <div className="text-[10px] sm:text-xs text-neutral-500 font-mono truncate max-w-full">
                {playing.url}
              </div>
              <div className="flex items-center gap-5 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest shrink-0">
                <button
                  onClick={handleCopy}
                  className={`transition-colors ${isCopied ? "text-green-500" : "text-neutral-400 hover:text-white"}`}
                >
                  {isCopied ? "COPIED!" : "COPY URL"}
                </button>
                <a
                  href={playing.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-neutral-400 hover:text-white transition-colors"
                >
                  OPEN IN BROWSER
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ── Hero ── */}
        {!playing && (
          <section className="relative h-[120px] md:h-[260px] w-full rounded-2xl overflow-hidden mb-6">
            <div className="absolute inset-0 bg-neutral-900" />
            <div className="absolute inset-0 bg-gradient-to-br from-red-950/40 via-neutral-950/60 to-black" />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 p-4 md:p-10 max-w-2xl">
              <div className="flex items-center gap-2 mb-1 md:mb-3">
                <span className="badge-live text-[8px]">
                  <span className="live-dot" /> LIVE NOW
                </span>
              </div>
              <h2 className="text-xl md:text-5xl font-black tracking-tighter leading-none mb-1 md:mb-3">
                EVERY MATCH.{" "}
                <span className="text-red-500">EVERY LANGUAGE.</span>
              </h2>
              <p className="hidden md:block text-neutral-400 text-[11px] md:text-sm font-medium max-w-md">
                Star Sports, Willow &amp; official feeds in Hindi, English, Tamil,
                Telugu, Kannada, Malayalam, Bengali, Punjabi, Marathi, Gujarati and
                more — in HD and 4K.
              </p>
            </div>
          </section>
        )}

        <div className="flex flex-col gap-10 mt-2">
          {/* ── Search + group chips ── */}
          <section>
            <div className="relative max-w-2xl mx-auto mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search channels — Star Sports, Hindi, 4K…"
                className="w-full bg-neutral-900 border border-white/10 rounded-xl py-3 sm:py-4 pl-12 pr-5 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 transition-all focus:ring-2 focus:ring-red-500/10"
              />
            </div>

            {/* Group chips */}
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar -mx-1 px-1">
              {groups.map((g) => (
                <button
                  key={g}
                  onClick={() => setActiveGroup(activeGroup === g ? "" : g)}
                  className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border transition-all ${
                    activeGroup === g
                      ? "bg-red-600 text-white border-transparent shadow-lg shadow-red-600/25"
                      : "bg-neutral-900/60 border-white/10 text-neutral-400 hover:text-white hover:border-white/20"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </section>

          {/* ── Content ── */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-28 gap-4 text-neutral-500">
              <Loader2 className="h-8 w-8 animate-spin text-red-600" />
              <p className="text-xs font-bold uppercase tracking-widest">
                Loading playlist…
              </p>
            </div>
          ) : loadError ? (
            <div className="text-center py-20 text-red-500 font-bold">
              Failed to load playlist: {loadError}
            </div>
          ) : (
            /* ── All channels flat grid, 5 per row ── */
            <section>
              {isSearching && (
                <div className="flex items-center gap-4 mb-5">
                  <h4 className="text-base sm:text-xl font-extrabold tracking-tighter text-red-500 uppercase italic">
                    Search Results
                  </h4>
                  <div className="h-px flex-1 bg-red-500/10" />
                  <span className="text-[9px] font-bold text-neutral-600 tracking-widest">
                    {filtered.length} FOUND
                  </span>
                </div>
              )}
              {filtered.length === 0 ? (
                <div className="py-16 text-center border-4 border-dashed border-white/5 rounded-[32px]">
                  <p className="text-neutral-600 font-black uppercase tracking-widest text-xs">
                    No channels match your search.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                    {filtered.slice(0, visibleCount).map((c) => (
                      <ChannelMiniCard
                        key={c.id}
                        channel={c}
                        searchTerm={query}
                        onPlay={handlePlay}
                      />
                    ))}
                  </div>
                  {visibleCount < filtered.length && (
                    <div className="flex flex-col items-center gap-2 mt-8">
                      <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">
                        Showing {visibleCount} of {filtered.length}
                      </p>
                      <button
                        onClick={() => setVisibleCount((v) => v + 40)}
                        className="px-8 py-3 rounded-xl bg-neutral-900 border border-white/10 hover:border-red-500/40 text-xs font-black uppercase tracking-widest text-neutral-300 hover:text-white transition-all hover:shadow-lg hover:shadow-red-600/10"
                      >
                        Show More
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="w-full border-t border-white/10 py-8 px-6 flex flex-col items-center justify-center gap-4 text-center text-neutral-400 bg-neutral-900/50">
        <span className="font-bold text-lg">
          <span className="text-red-500">Zestyy</span><span className="text-white">TV</span>
        </span>
        <p className="text-sm">
          Streams from third-party playlist · Personal use only
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="https://instagram.com/nikkk.exe"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-[11px] font-black px-4 py-2 rounded-full uppercase tracking-wider transition-colors border border-white/10"
          >
            💬 Suggestions
          </a>
          <a
            href="https://zestyyflix.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-[11px] font-black px-4 py-2 rounded-full uppercase tracking-wider transition-colors shadow-lg shadow-red-600/20"
          >
            🎬 More from ZestyyFlix
          </a>
        </div>
        <p className="text-xs">
          Built by{" "}
          <a
            href="https://instagram.com/nikkk.exe"
            target="_blank"
            rel="noreferrer"
            className="text-red-500 font-medium hover:text-red-400 transition-colors"
          >
            @nikkk.exe
          </a>
        </p>
      </footer>

      {/* ── StreamPlayer overlay ── */}
      {playing && (
        <StreamPlayer
          channel={playing}
          useProxy={false}
          onClose={() => setPlaying(null)}
        />
      )}
    </div>
  );
};

export default Index;
