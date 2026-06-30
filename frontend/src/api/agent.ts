import axios from 'axios';
import { API_BASE_URL } from './client';

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

let resolvedAgentBaseUrl: string | null = null;

function toOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, '');
  }
}

function getAgentBaseCandidates() {
  const candidates = new Set<string>();
  const runtimeBaseUrl = localStorage.getItem('xtten_api_base_url');
  const hostname = window.location.hostname || 'localhost';
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';

  if (resolvedAgentBaseUrl) {
    candidates.add(toOrigin(resolvedAgentBaseUrl));
  }

  if (runtimeBaseUrl) {
    candidates.add(toOrigin(runtimeBaseUrl));
  }

  if (API_BASE_URL) {
    candidates.add(toOrigin(API_BASE_URL));
  }

  candidates.add(`${protocol}//${hostname}:3000`);
  if (hostname.toLowerCase() !== 'localhost') {
    candidates.add(`${protocol}//localhost:3000`);
  }

  return [...candidates];
}

export async function getAgentReleases() {
  let lastError: unknown = null;

  for (const baseUrl of getAgentBaseCandidates()) {
    try {
      const response = await axios.get<AgentReleasesResponse>(
        `${baseUrl}/agent/releases`,
        { withCredentials: true },
      );
      resolvedAgentBaseUrl = baseUrl;
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export function openAgentDownload(platform: 'windows' | 'macos', format: string) {
  const candidates = getAgentBaseCandidates();
  const base = resolvedAgentBaseUrl || candidates[0] || toOrigin(API_BASE_URL);
  const url = `${base}/agent/download/${platform}?format=${encodeURIComponent(format)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
