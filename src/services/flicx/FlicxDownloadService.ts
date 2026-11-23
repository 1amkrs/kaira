export interface DownloadFile {
  name: string;
  url: string;
  quality: string;
  tags: string[];
  sizeStr: string;
  bytes: number;
}

export interface TitleDownloadPackage {
  title: string;
  year?: number;
  folderUrl: string;
  files: DownloadFile[];
}

export class FlicxDownloadService {
  private static cleanName(name: string): string {
    return name.replace(/[:\/\\?*|"<>&]/g, '').trim();
  }

  public static getMovieDownloads(title: string, year?: number): TitleDownloadPackage {
    const cleanTitle = this.cleanName(title);
    const yr = year || 2024;
    const encodedFolder = encodeURIComponent(`${cleanTitle} (${yr})`);
    const folderUrl = `https://a.111477.xyz/movies/${encodedFolder}/`;
    const safeTitle = cleanTitle.replace(/\s+/g, '.');

    const files: DownloadFile[] = [
      {
        name: `${safeTitle}.${yr}.2160p.AMZN.WEB-DL.DV.HDR10+.MULTi.mp4`,
        url: `${folderUrl}${encodeURIComponent(`${safeTitle}.${yr}.2160p.AMZN.WEB-DL.DV.HDR10+.MULTi.mp4`)}`,
        quality: '4K WEB-DL',
        tags: ['Amazon', 'Dolby Vision', 'HDR10+', 'Multi-language'],
        sizeStr: '43.6 GB',
        bytes: 46834656063,
      },
      {
        name: `${safeTitle}.${yr}.MULTi.VF2.HDR.DV.2160p.WEB.H265-SUPPLY.mkv`,
        url: `${folderUrl}${encodeURIComponent(`${safeTitle}.${yr}.MULTi.VF2.HDR.DV.2160p.WEB.H265-SUPPLY.mkv`)}`,
        quality: '4K WEB',
        tags: ['Dolby Vision', 'HDR', 'Multi-language'],
        sizeStr: '36.6 GB',
        bytes: 39278041111,
      },
      {
        name: `${safeTitle}.${yr}.1080p.WEB.h264-ETHEL.mkv`,
        url: `${folderUrl}${encodeURIComponent(`${safeTitle}.${yr}.1080p.WEB.h264-ETHEL.mkv`)}`,
        quality: '1080p WEB',
        tags: ['1080p', 'WEB', 'AVC'],
        sizeStr: '14.4 GB',
        bytes: 15488982033,
      },
      {
        name: `${cleanTitle} ${yr} 1080p BluRay x264-OFT.mkv`,
        url: `${folderUrl}${encodeURIComponent(`${cleanTitle} ${yr} 1080p BluRay x264-OFT.mkv`)}`,
        quality: '1080p Blu-ray',
        tags: ['1080p', 'BluRay'],
        sizeStr: '8.6 GB',
        bytes: 9234125824,
      },
      {
        name: `${cleanTitle} ${yr} 720p MA WEB-DL DDP5 1 Atmos H 264-BYNDR.mkv`,
        url: `${folderUrl}${encodeURIComponent(`${cleanTitle} ${yr} 720p MA WEB-DL DDP5 1 Atmos H 264-BYNDR.mkv`)}`,
        quality: '720p WEB-DL',
        tags: ['720p', 'DD+ Atmos 5.1'],
        sizeStr: '6.5 GB',
        bytes: 6979321856,
      },
      {
        name: `${cleanTitle} ${yr} iNTERNAL 720p 10bit WEBRip 2CH x265 HEVC-PSA.mkv`,
        url: `${folderUrl}${encodeURIComponent(`${cleanTitle} ${yr} iNTERNAL 720p 10bit WEBRip 2CH x265 HEVC-PSA.mkv`)}`,
        quality: '720p WEBRip',
        tags: ['720p', '2.0', 'HEVC', '10-bit'],
        sizeStr: '2.3 GB',
        bytes: 2480787552,
      },
    ];

    return {
      title,
      year: yr,
      folderUrl,
      files,
    };
  }

  public static getShowEpisodeDownloads(
    title: string,
    season: number,
    episode: number,
    episodeTitle?: string
  ): TitleDownloadPackage {
    const cleanTitle = this.cleanName(title);
    const sStr = String(season).padStart(2, '0');
    const eStr = String(episode).padStart(2, '0');
    const epCode = `S${sStr}E${eStr}`;
    const encodedFolder = encodeURIComponent(cleanTitle);
    const folderUrl = `https://a.111477.xyz/shows/${encodedFolder}/Season%20${season}/`;
    const safeTitle = cleanTitle.replace(/\s+/g, '.');

    const files: DownloadFile[] = [
      {
        name: `${safeTitle}.${epCode}.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265.mkv`,
        url: `${folderUrl}${encodeURIComponent(`${safeTitle}.${epCode}.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265.mkv`)}`,
        quality: '4K WEB-DL',
        tags: ['Dolby Vision', 'HDR', 'DD+ Atmos 5.1'],
        sizeStr: '8.4 GB',
        bytes: 9019431321,
      },
      {
        name: `${safeTitle}.${epCode}.1080p.WEB-DL.DDP5.1.Atmos.H.264.mkv`,
        url: `${folderUrl}${encodeURIComponent(`${safeTitle}.${epCode}.1080p.WEB-DL.DDP5.1.Atmos.H.264.mkv`)}`,
        quality: '1080p WEB-DL',
        tags: ['1080p', 'DD+ Atmos 5.1'],
        sizeStr: '3.8 GB',
        bytes: 4080218931,
      },
      {
        name: `${safeTitle}.${epCode}.720p.WEB-DL.x264.mkv`,
        url: `${folderUrl}${encodeURIComponent(`${safeTitle}.${epCode}.720p.WEB-DL.x264.mkv`)}`,
        quality: '720p WEB-DL',
        tags: ['720p', 'AAC 2.0'],
        sizeStr: '1.4 GB',
        bytes: 1503238553,
      },
    ];

    return {
      title: `${title} - ${epCode}${episodeTitle ? `: ${episodeTitle}` : ''}`,
      folderUrl,
      files,
    };
  }
}
