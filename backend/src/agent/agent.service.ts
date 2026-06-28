import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';

type Platform = 'windows' | 'macos';
type ArtifactFormat = 'exe' | 'msi' | 'dmg' | 'pkg';

type ArtifactInfo = {
  platform: Platform;
  format: ArtifactFormat;
  fileName: string;
  version: string;
  downloadUrl: string;
  available: boolean;
  size: number | null;
};

@Injectable()
export class AgentService {
  private readonly releaseVersion = this.resolveReleaseVersion();

  private readonly artifactsDir =
    process.env.AGENT_RELEASES_DIR ||
    path.resolve(process.cwd(), '..', 'windows-agent', 'desktop-agent', 'dist');

  private readonly artifactNames: Record<
    Platform,
    Partial<Record<ArtifactFormat, string>>
  > = {
    windows: {
      exe: process.env.AGENT_WINDOWS_EXE_NAME || 'xtten-agent-setup.exe',
      msi: process.env.AGENT_WINDOWS_MSI_NAME || 'xtten-agent-setup.msi',
    },
    macos: {
      dmg: process.env.AGENT_MACOS_DMG_NAME || 'xtten-agent.dmg',
      pkg: process.env.AGENT_MACOS_PKG_NAME || 'xtten-agent.pkg',
    },
  };

  private resolveReleaseVersion() {
    if (process.env.AGENT_RELEASE_VERSION) {
      return process.env.AGENT_RELEASE_VERSION;
    }

    try {
      const desktopPkgPath = path.resolve(
        process.cwd(),
        '..',
        'windows-agent',
        'desktop-agent',
        'package.json',
      );
      if (existsSync(desktopPkgPath)) {
        const raw = readFileSync(desktopPkgPath, 'utf8');
        const parsed = JSON.parse(raw) as { version?: string };
        if (parsed?.version) {
          return parsed.version;
        }
      }
    } catch {
      // Fallback below.
    }

    return process.env.npm_package_version || '0.1.0';
  }

  getReleases(baseUrl: string) {
    return {
      version: this.releaseVersion,
      generatedAt: new Date().toISOString(),
      platforms: {
        windows: {
          version: this.releaseVersion,
          artifacts: [
            this.getArtifactInfo('windows', 'exe', baseUrl),
            this.getArtifactInfo('windows', 'msi', baseUrl),
          ],
          notes: [
            'Windows MVP supports employee login and company binding.',
            'Desktop app runs in tray and can auto start with system.',
          ],
        },
        macos: {
          version: process.env.AGENT_MACOS_VERSION || 'coming-soon',
          artifacts: [
            this.getArtifactInfo('macos', 'dmg', baseUrl),
            this.getArtifactInfo('macos', 'pkg', baseUrl),
          ],
          notes: [
            'macOS package is planned after Windows MVP completion.',
            'Future builds require Screen Recording and Accessibility permissions.',
          ],
        },
      },
    };
  }

  resolveDownload(platform: Platform, format: ArtifactFormat) {
    const fileName = this.artifactNames[platform]?.[format];
    if (!fileName) return null;

    const filePath = path.resolve(this.artifactsDir, fileName);
    if (!existsSync(filePath)) {
      return {
        fileName,
        filePath,
        available: false,
      };
    }

    return {
      fileName,
      filePath,
      available: true,
    };
  }

  private getArtifactInfo(
    platform: Platform,
    format: ArtifactFormat,
    baseUrl: string,
  ): ArtifactInfo {
    const target = this.resolveDownload(platform, format);
    const downloadUrl = `${baseUrl}/agent/download/${platform}?format=${format}`;

    if (!target || !target.available) {
      return {
        platform,
        format,
        fileName:
          target?.fileName ||
          this.artifactNames[platform]?.[format] ||
          `${platform}.${format}`,
        version: this.releaseVersion,
        downloadUrl,
        available: false,
        size: null,
      };
    }

    const size = statSync(target.filePath).size;
    return {
      platform,
      format,
      fileName: target.fileName,
      version: this.releaseVersion,
      downloadUrl,
      available: true,
      size,
    };
  }
}
