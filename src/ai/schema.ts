// Validation for untrusted AI output. Models occasionally wrap JSON in prose or
// code fences, omit fields or ignore limits; everything is checked here before
// it reaches the UI or the Dribbble page.

import type { DesignAnalysis, ShotContent } from '../types';
import { AppError } from '../utils/errors';
import { normalizeTags } from '../utils/tags';

export const TITLE_MAX_LENGTH = 80;
export const DESCRIPTION_MAX_LENGTH = 1500;
export const MIN_TAGS = 3;

type JsonObject = Record<string, unknown>;

function invalid(detail: string): AppError {
  return new AppError('AI_FAILED', `Invalid AI response: ${detail}`, { retryable: true });
}

/** Extracts a JSON object from a model response, tolerating code fences and surrounding prose. */
export function parseJsonObject(text: string | null | undefined): JsonObject {
  const raw = (text ?? '').trim();
  if (!raw) throw invalid('empty response');

  const candidates = [raw];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) candidates.push(raw.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed as JsonObject;
    } catch {
      // try the next candidate
    }
  }
  throw invalid('malformed JSON');
}

function cleanText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:–-]+$/, '');
}

export function validateTitle(value: unknown): string {
  if (typeof value !== 'string') throw invalid('missing title');
  const title = cleanText(value)
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[.!]+$/, '')
    .trim();
  if (!title) throw invalid('empty title');
  return truncateAtWord(title, TITLE_MAX_LENGTH);
}

export function validateDescription(value: unknown): string {
  if (typeof value !== 'string') throw invalid('missing description');
  const description = cleanText(value);
  if (!description) throw invalid('empty description');
  return truncateAtWord(description, DESCRIPTION_MAX_LENGTH);
}

export function validateTags(value: unknown, maxTags: number): string[] {
  let list: unknown = value;
  // Some models return "ui, ux, dashboard" instead of an array.
  if (typeof list === 'string') list = list.split(',');
  if (!Array.isArray(list)) throw invalid('missing tags');
  const tags = normalizeTags(
    list.filter((t): t is string => typeof t === 'string'),
    maxTags,
  );
  if (tags.length < MIN_TAGS) throw invalid(`only ${tags.length} usable tags`);
  return tags;
}

export function validateShotContent(value: unknown, maxTags: number): ShotContent {
  const obj = (typeof value === 'string' ? parseJsonObject(value) : value) as JsonObject | null;
  if (typeof obj !== 'object' || obj === null) throw invalid('not an object');
  return {
    title: validateTitle(obj.title),
    description: validateDescription(obj.description),
    tags: validateTags(obj.tags, maxTags),
  };
}

function stringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim())
    .slice(0, limit);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function validateDesignAnalysis(value: unknown): DesignAnalysis {
  const obj = (typeof value === 'string' ? parseJsonObject(value) : value) as JsonObject | null;
  if (typeof obj !== 'object' || obj === null) throw invalid('analysis is not an object');

  const designType = optionalString(obj.designType);
  const subject = optionalString(obj.subject);
  if (!designType || !subject) throw invalid('analysis missing designType or subject');

  const analysis: DesignAnalysis = {
    designType,
    subject,
    visualStyle: optionalString(obj.visualStyle) ?? 'unspecified',
    colors: stringList(obj.colors, 8),
    keywords: stringList(obj.keywords, 20),
  };
  const industry = optionalString(obj.industry);
  const typography = optionalString(obj.typography);
  const uxPatterns = stringList(obj.uxPatterns, 10);
  if (industry) analysis.industry = industry;
  if (typography) analysis.typography = typography;
  if (uxPatterns.length) analysis.uxPatterns = uxPatterns;
  return analysis;
}
