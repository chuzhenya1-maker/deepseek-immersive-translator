import {
  isElementVisible,
  normalizeText,
  shouldSkipSubtree,
  shouldTranslateElement,
  shouldTranslateText,
  type VisibilityCache,
} from './domFilter.ts';
import type { TranslationNode } from '../types/translation';

const PREFERRED_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'BLOCKQUOTE',
  'FIGCAPTION',
  'TD',
  'TH',
]);

const CONTAINER_TAGS = new Set(['ARTICLE', 'SECTION', 'DIV']);

type CandidateCategory = 'preferred' | 'container' | 'inline';

interface Candidate {
  element: HTMLElement;
  category: CandidateCategory;
}

export interface DomScanStats {
  scannedElements: number;
  candidateElements: number;
  filteredElements: number;
  translationNodes: number;
  totalCharacters: number;
}

export interface DomScanResult {
  nodes: TranslationNode[];
  stats: DomScanStats;
}

let nextNodeNumber = 1;

function getCandidateCategory(element: HTMLElement): CandidateCategory | null {
  if (PREFERRED_TAGS.has(element.tagName)) {
    return 'preferred';
  }

  if (CONTAINER_TAGS.has(element.tagName)) {
    return 'container';
  }

  return element.tagName === 'SPAN' ? 'inline' : null;
}

function hasAncestorInSet(
  element: HTMLElement,
  elements: ReadonlySet<HTMLElement>,
): boolean {
  let current = element.parentElement;

  while (current) {
    if (elements.has(current)) {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

function markCandidateAncestors(
  element: HTMLElement,
  candidates: ReadonlyMap<HTMLElement, Candidate>,
  category: CandidateCategory,
  target: Set<HTMLElement>,
): void {
  let current = element.parentElement;

  while (current) {
    if (candidates.get(current)?.category === category) {
      target.add(current);
    }
    current = current.parentElement;
  }
}

function selectCandidates(candidates: readonly Candidate[]): Set<HTMLElement> {
  const candidateMap = new Map(
    candidates.map((candidate) => [candidate.element, candidate]),
  );
  const selected = new Set<HTMLElement>();

  const preferred = candidates.filter(
    (candidate) => candidate.category === 'preferred',
  );
  const preferredParents = new Set<HTMLElement>();
  for (const candidate of preferred) {
    markCandidateAncestors(
      candidate.element,
      candidateMap,
      'preferred',
      preferredParents,
    );
  }

  const selectedPreferred = new Set(
    preferred
      .filter((candidate) => !preferredParents.has(candidate.element))
      .map((candidate) => candidate.element),
  );
  for (const element of selectedPreferred) {
    selected.add(element);
  }

  const containersWithPreferredDescendants = new Set<HTMLElement>();
  for (const element of selectedPreferred) {
    markCandidateAncestors(
      element,
      candidateMap,
      'container',
      containersWithPreferredDescendants,
    );
  }

  const availableContainers = candidates
    .filter((candidate) => candidate.category === 'container')
    .filter(
      (candidate) =>
        !containersWithPreferredDescendants.has(candidate.element) &&
        !hasAncestorInSet(candidate.element, selectedPreferred),
    );
  const availableContainerSet = new Set(
    availableContainers.map((candidate) => candidate.element),
  );
  const containerParents = new Set<HTMLElement>();

  for (const candidate of availableContainers) {
    let current = candidate.element.parentElement;
    while (current) {
      if (availableContainerSet.has(current)) {
        containerParents.add(current);
      }
      current = current.parentElement;
    }
  }

  for (const candidate of availableContainers) {
    if (!containerParents.has(candidate.element)) {
      selected.add(candidate.element);
    }
  }

  for (const candidate of candidates) {
    if (
      candidate.category === 'inline' &&
      !hasAncestorInSet(candidate.element, selected)
    ) {
      selected.add(candidate.element);
    }
  }

  return selected;
}

function extractText(
  element: HTMLElement,
  visibilityCache: VisibilityCache,
): string {
  const parts: string[] = [];

  const visit = (parent: HTMLElement) => {
    for (const child of parent.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        parts.push(child.nodeValue ?? '');
        continue;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }

      const childElement = child as HTMLElement;
      if (
        shouldSkipSubtree(childElement) ||
        !isElementVisible(childElement, visibilityCache)
      ) {
        parts.push(' ');
        continue;
      }

      visit(childElement);
    }
  };

  visit(element);
  return normalizeText(parts.join(''));
}

function getNodeId(
  element: HTMLElement,
  usedIds: Set<string>,
): string | null {
  const existingId = element.getAttribute('data-ds-node-id')?.trim();
  if (existingId) {
    if (usedIds.has(existingId)) {
      return null;
    }
    usedIds.add(existingId);
    return existingId;
  }

  let id: string;
  do {
    id = `ds-node-${String(nextNodeNumber).padStart(6, '0')}`;
    nextNodeNumber += 1;
  } while (usedIds.has(id));

  element.setAttribute('data-ds-node-id', id);
  usedIds.add(id);
  return id;
}

export function scanRootWithStats(root: HTMLElement): DomScanResult {
  const visibilityCache: VisibilityCache = new WeakMap();
  const candidates: Candidate[] = [];
  let scannedElements = 0;
  let candidateElements = 0;

  const considerElement = (element: HTMLElement): void => {
    scannedElements += 1;
    const category = getCandidateCategory(element);
    if (!category) {
      return;
    }

    candidateElements += 1;
    if (
      !shouldTranslateElement(element, visibilityCache) ||
      !shouldTranslateText(element.textContent ?? '')
    ) {
      return;
    }

    candidates.push({ element, category });
  };

  if (!shouldSkipSubtree(root)) {
    considerElement(root);
  }

  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        const element = node as HTMLElement;
        return shouldSkipSubtree(element)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  let current = walker.nextNode();
  while (current) {
    considerElement(current as HTMLElement);
    current = walker.nextNode();
  }

  const selected = selectCandidates(candidates);
  const usedIds = new Set<string>();
  const nodes: TranslationNode[] = [];

  for (const candidate of candidates) {
    if (!selected.has(candidate.element)) {
      continue;
    }

    const originalText = extractText(candidate.element, visibilityCache);
    if (!shouldTranslateText(originalText)) {
      continue;
    }

    const id = getNodeId(candidate.element, usedIds);
    if (!id) {
      continue;
    }

    nodes.push({
      id,
      element: candidate.element,
      originalText,
      status: 'pending',
    });
  }

  const totalCharacters = nodes.reduce(
    (total, node) => total + node.originalText.length,
    0,
  );

  return {
    nodes,
    stats: {
      scannedElements,
      candidateElements,
      filteredElements: candidateElements - nodes.length,
      translationNodes: nodes.length,
      totalCharacters,
    },
  };
}

export function scanRoot(root: HTMLElement): TranslationNode[] {
  return scanRootWithStats(root).nodes;
}

export function scanDocumentWithStats(
  targetDocument: Document = document,
): DomScanResult {
  if (!targetDocument.body) {
    return {
      nodes: [],
      stats: {
        scannedElements: 0,
        candidateElements: 0,
        filteredElements: 0,
        translationNodes: 0,
        totalCharacters: 0,
      },
    };
  }

  return scanRootWithStats(targetDocument.body);
}

export function scanDocument(targetDocument: Document = document): TranslationNode[] {
  return scanDocumentWithStats(targetDocument).nodes;
}
