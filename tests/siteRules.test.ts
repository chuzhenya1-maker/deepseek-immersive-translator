import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSiteRuleUpdate,
  getSiteRule,
  normalizeHostname,
} from '../src/services/siteRules.ts';

test('normalizes URLs and www while preserving meaningful subdomains', () => {
  assert.equal(normalizeHostname('https://www.Nature.com/article'), 'nature.com');
  assert.equal(normalizeHostname('sub.example.com'), 'sub.example.com');
  assert.equal(normalizeHostname('hello world'), null);
  assert.equal(normalizeHostname('localhost'), null);
});

test('site rules resolve default, auto, and excluded with excluded priority', () => {
  assert.equal(getSiteRule('example.com', { autoTranslateSites: [], excludedSites: [] }), 'default');
  assert.equal(getSiteRule('www.nature.com', { autoTranslateSites: ['nature.com'], excludedSites: [] }), 'auto');
  assert.equal(
    getSiteRule('nature.com', {
      autoTranslateSites: ['nature.com'],
      excludedSites: ['nature.com'],
    }),
    'excluded',
  );
});

test('site rule updates deduplicate and enforce mutual exclusion', () => {
  const update = createSiteRuleUpdate('https://www.nature.com/a', 'auto', {
    autoTranslateSites: ['nature.com'],
    excludedSites: ['nature.com', 'github.com'],
  });
  assert.deepEqual(update, {
    autoTranslateSites: ['nature.com'],
    excludedSites: ['github.com'],
  });
});
