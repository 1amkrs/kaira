import { SubtitleCue } from './types';

export class SubtitleEngine {
  private cues: SubtitleCue[] = [];
  private activeCues: SubtitleCue[] = [];
  private listeners: Set<(text: string | null) => void> = new Set();
  private lastText: string | null = null;

  public async loadSubtitles(url: string): Promise<number> {
    this.cues = [];
    this.activeCues = [];
    this.notify(null);

    if (!url) return 0;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      this.cues = this.parseSubtitleText(text);
      console.log(`[SubtitleEngine] Loaded ${this.cues.length} subtitle cues from ${url}`);
      return this.cues.length;
    } catch (e) {
      console.warn('[SubtitleEngine] Failed to load subtitle track:', e);
      return 0;
    }
  }

  public clear(): void {
    this.cues = [];
    this.activeCues = [];
    this.notify(null);
  }

  public subscribe(listener: (text: string | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.lastText);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(text: string | null): void {
    if (this.lastText === text) return;
    this.lastText = text;
    this.listeners.forEach((fn) => fn(text));
  }

  public updateTime(currentTime: number): void {
    if (this.cues.length === 0) {
      this.notify(null);
      return;
    }

    const matching = this.cues.filter((c) => currentTime >= c.start && currentTime <= c.end);
    if (matching.length > 0) {
      const combined = matching.map((c) => c.text).join('\n');
      this.notify(combined);
    } else {
      this.notify(null);
    }
  }

  private parseTimestamp(str: string): number {
    const clean = str.trim().replace(',', '.');
    const parts = clean.split(':');
    if (parts.length === 3) {
      const hours = parseFloat(parts[0]) || 0;
      const minutes = parseFloat(parts[1]) || 0;
      const seconds = parseFloat(parts[2]) || 0;
      return hours * 3600 + minutes * 60 + seconds;
    } else if (parts.length === 2) {
      const minutes = parseFloat(parts[0]) || 0;
      const seconds = parseFloat(parts[1]) || 0;
      return minutes * 60 + seconds;
    }
    return 0;
  }

  private stripTags(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  private parseSubtitleText(content: string): SubtitleCue[] {
    const cues: SubtitleCue[] = [];
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = normalized.split(/\n\n+/);

    for (let i = 0; i < blocks.length; i++) {
      const lines = blocks[i].trim().split('\n');
      if (lines.length === 0) continue;

      let timeLineIdx = -1;
      for (let j = 0; j < lines.length; j++) {
        if (lines[j].includes('-->')) {
          timeLineIdx = j;
          break;
        }
      }

      if (timeLineIdx >= 0) {
        const timeLine = lines[timeLineIdx];
        const [startStr, endStr] = timeLine.split('-->');
        if (startStr && endStr) {
          const start = this.parseTimestamp(startStr.trim().split(' ')[0]);
          const end = this.parseTimestamp(endStr.trim().split(' ')[0]);
          const textLines = lines.slice(timeLineIdx + 1);
          const rawText = textLines.join('\n');
          const cleanText = this.stripTags(rawText);

          if (cleanText && end > start) {
            cues.push({
              id: `cue-${i}`,
              start,
              end,
              text: cleanText,
            });
          }
        }
      }
    }

    return cues.sort((a, b) => a.start - b.start);
  }
}
