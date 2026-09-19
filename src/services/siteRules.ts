import type { AppSettings, SettingsUpdate } from '../types/settings.ts';

export type SiteTranslationRule = 'default' | 'auto' | 'excluded';

export function normalizeHostname(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || /\s/u.test(trimmed)) {
    return null;
  }
  let hostname: string;
  try {
    hostname = new URL(
      /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmed)
        ? trimmed
        : `https://${trimmed}`,
    ).hostname;
  } catch {
    return null;
  }
  hostname = hostname.replace(/^www\./u, '').replace(/\.$/u, '');
  if (
    !hostname ||
    hostname.length > 253 ||
    !hostname.includes('.') ||
    !hostname.split('.').every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/u.test(label),
    )
  ) {
    return null;
  }
  return hostname;
}

function normalizedSites(sites: readonly string[]): string[] {
  return [...new Set(sites.map(normalizeHostname).filter((site): site is string => site !== null))];
}

export function getSiteRule(
  hostname: string,
  settings: Pick<AppSettings, 'autoTranslateSites' | 'excludedSites'>,
): SiteTranslationRule {
  const normalized = normalizeHostname(hostname);
  if (!normalized) {
    return 'default';
  }
  if (normalizedSites(settings.excludedSites).includes(normalized)) {
    return 'excluded';
  }
  if (normalizedSites(settings.autoTranslateSites).includes(normalized)) {
    return 'auto';
  }
  return 'default';
}

export function createSiteRuleUpdate(
  hostname: string,
  rule: SiteTranslationRule,
  settings: Pick<AppSettings, 'autoTranslateSites' | 'excludedSites'>,
): SettingsUpdate | null {
  const normalized = normalizeHostname(hostname);
  if (!normalized) {
    return null;
  }
  const auto = normalizedSites(settings.autoTranslateSites).filter(
    (site) => site !== normalized,
  );
  const excluded = normalizedSites(settings.excludedSites).filter(
    (site) => site !== normalized,
  );
  if (rule === 'auto') {
    auto.push(normalized);
  } else if (rule === 'excluded') {
    excluded.push(normalized);
  }
  return { autoTranslateSites: auto, excludedSites: excluded };
}
