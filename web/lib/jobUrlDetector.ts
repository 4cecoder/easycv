export interface DetectedPlatform {
  id: "indeed" | "linkedin" | "other";
  name: string;
  url: string;
}

export interface JobUrlDetectionResult {
  hasUrl: boolean;
  hasIndeed: boolean;
  hasLinkedIn: boolean;
  urls: string[];
  primaryUrl?: string;
  detectedPlatforms: DetectedPlatform[];
}

/**
 * Detects pasted job URLs (Indeed, LinkedIn, or generic URLs) in job description text.
 */
export function detectJobUrls(text: string): JobUrlDetectionResult {
  if (!text || !text.trim()) {
    return {
      hasUrl: false,
      hasIndeed: false,
      hasLinkedIn: false,
      urls: [],
      detectedPlatforms: [],
    };
  }

  // Match full http/https URLs and bare domain patterns for Indeed / LinkedIn
  const urlRegex = /(?:https?:\/\/)[^\s<>"'\(\)]+/gi;
  const bareDomainRegex = /(?:[a-zA-Z0-9-]+\.)*(?:indeed|linkedin)\.[a-z.]{2,6}(?:\/[^\s<>"'\(\)]*)?/gi;

  const rawMatches = Array.from(text.matchAll(urlRegex), (m) => m[0]);
  const bareMatches = Array.from(text.matchAll(bareDomainRegex), (m) => {
    const raw = m[0];
    return raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
  });

  const allUrls: string[] = [];
  const seen = new Set<string>();

  for (const match of [...rawMatches, ...bareMatches]) {
    const cleaned = match.replace(/[,.;!]+$/, "");
    const normalized = cleaned.startsWith("http://") || cleaned.startsWith("https://")
      ? cleaned
      : `https://${cleaned}`;

    if (!seen.has(normalized.toLowerCase())) {
      seen.add(normalized.toLowerCase());
      allUrls.push(normalized);
    }
  }

  const detectedPlatforms: DetectedPlatform[] = [];
  let hasIndeed = false;
  let hasLinkedIn = false;

  for (const url of allUrls) {
    const low = url.toLowerCase();
    if (low.includes("indeed.")) {
      hasIndeed = true;
      if (!detectedPlatforms.some((p) => p.id === "indeed")) {
        detectedPlatforms.push({
          id: "indeed",
          name: "Indeed",
          url,
        });
      }
    } else if (low.includes("linkedin.")) {
      hasLinkedIn = true;
      if (!detectedPlatforms.some((p) => p.id === "linkedin")) {
        detectedPlatforms.push({
          id: "linkedin",
          name: "LinkedIn",
          url,
        });
      }
    } else {
      if (!detectedPlatforms.some((p) => p.id === "other")) {
        detectedPlatforms.push({
          id: "other",
          name: "Job Link",
          url,
        });
      }
    }
  }

  return {
    hasUrl: allUrls.length > 0,
    hasIndeed,
    hasLinkedIn,
    urls: allUrls,
    primaryUrl: allUrls[0],
    detectedPlatforms,
  };
}
