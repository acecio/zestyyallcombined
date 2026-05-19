export interface Channel {
  id: string;
  name: string;
  group: string;
  logo?: string;
  url: string;
}

export function parseM3U(text: string): Channel[] {
  const lines = text.split(/\r?\n/);
  const out: Channel[] = [];
  let pending: Partial<Channel> | null = null;
  let idx = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF")) {
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const commaIdx = line.indexOf(",");
      const name = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : "Unknown";
      pending = {
        name,
        group: groupMatch?.[1] || "Other",
        logo: logoMatch?.[1],
      };
    } else if (!line.startsWith("#") && pending) {
      out.push({
        id: `${idx++}`,
        name: pending.name || "Unknown",
        group: pending.group || "Other",
        logo: pending.logo,
        url: line,
      });
      pending = null;
    }
  }
  return out;
}

export function getProxyUrl(streamUrl: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL;
  return `${base}/functions/v1/stream-proxy?url=${encodeURIComponent(streamUrl)}`;
}
