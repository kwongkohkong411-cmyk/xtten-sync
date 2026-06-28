import client, { API_BASE_URL } from './client';

export type AgentArtifact = {
  platform: 'windows' | 'macos';
  format: 'exe' | 'msi' | 'dmg' | 'pkg';
  fileName: string;
  version: string;
  downloadUrl: string;
  available: boolean;
  size: number | null;
};

export type AgentReleasesResponse = {
  version: string;
  generatedAt: string;
  platforms: {
    windows: {
      version: string;
      artifacts: AgentArtifact[];
      notes: string[];
    };
    macos: {
      version: string;
      artifacts: AgentArtifact[];
      notes: string[];
    };
  };
};

export const getAgentReleases = () =>
  client.get<AgentReleasesResponse>('/agent/releases');

export function openAgentDownload(platform: 'windows' | 'macos', format: string) {
  const base = client.defaults.baseURL || API_BASE_URL;
  const url = `${base}/agent/download/${platform}?format=${encodeURIComponent(format)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
