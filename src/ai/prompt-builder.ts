// Provider-neutral prompts. Providers decide how to transport them.

import type { DesignAnalysis, GenerationOptions, ShotContent, ShotField, Tone } from '../types';

export const SYSTEM_PROMPT = `You are an experienced Dribbble content assistant who has written thousands of shot titles, descriptions and tags for professional UI/UX designers.

Principles:
- Describe only what can reasonably be seen or inferred from the design. Never invent features, metrics, clients or functionality.
- Use precise design terminology (layout, hierarchy, components, navigation patterns, data visualisation, typography, colour).
- No clickbait, no hype, no emojis, no hashtags, no marketing fluff.
- Always reply with a single JSON object and nothing else.`;

export const PREFERRED_TAGS = [
  'ui',
  'ux',
  'web-design',
  'mobile-design',
  'app-design',
  'dashboard',
  'saas',
  'fintech',
  'ecommerce',
  'branding',
  'landing-page',
  'product-design',
  'illustration',
  'typography',
  'design-system',
] as const;

const TONE_GUIDE: Record<Tone, string> = {
  professional: 'Clear, confident and professional, like a senior product designer presenting work.',
  minimal: 'Concise and understated. Short sentences, no adjectives that do not add information.',
  creative: 'Warm and expressive while staying credible; may mention the mood or inspiration behind the visuals.',
};

export const ANALYSIS_PROMPT = `Analyse this design as a senior UI/UX designer preparing a Dribbble shot.

Return JSON with exactly these keys:
{
  "designType": "e.g. web dashboard, mobile app screens, landing page, logo, illustration, icon set",
  "subject": "what the product or piece is about, in one sentence",
  "visualStyle": "e.g. minimal, glassmorphism, brutalist, flat, 3D, editorial",
  "industry": "e.g. fintech, healthcare, e-commerce (or \\"unknown\\")",
  "typography": "short description of the type style",
  "colors": ["dominant colours as plain names or hex, max 6"],
  "uxPatterns": ["visible UI/UX patterns, e.g. sidebar navigation, card grid, data table, onboarding steps"],
  "keywords": ["8-15 precise design keywords"]
}

Only include what is visible or strongly implied by the image.`;

function analysisContext(analysis: DesignAnalysis): string {
  return `Design analysis (from the image):\n${JSON.stringify(analysis, null, 2)}`;
}

function currentContext(current: Partial<ShotContent>, exclude: ShotField): string {
  const entries = Object.entries(current).filter(([key, value]) => key !== exclude && value !== undefined);
  if (!entries.length) return '';
  return `\nAlready chosen for this shot (stay consistent with it):\n${JSON.stringify(Object.fromEntries(entries), null, 2)}`;
}

const FIELD_INSTRUCTIONS: Record<ShotField, (options: GenerationOptions) => string> = {
  title: () => `Write the shot TITLE.
- 3 to 8 words, Title Case, descriptive and specific (e.g. "Modern SaaS Analytics Dashboard").
- No quotes, no trailing punctuation, no emojis, no clickbait.
Return: {"title": "..."}`,

  description: () => `Write the shot DESCRIPTION.
- 1 to 3 short paragraphs (separate paragraphs with a blank line), under 120 words total.
- Explain the concept and the key UI/UX decisions that are visible (layout, hierarchy, components, colour, typography).
- Do not invent features, data or results that cannot be seen. No marketing language, no hashtags, no calls to action.
Return: {"description": "..."}`,

  tags: (options) => `Choose exactly ${options.tagCount} TAGS.
- Lowercase, hyphenate multi-word tags (e.g. "web-design", "landing-page").
- Highly relevant to this specific design; mix the discipline (ui, ux, product-design), the format (dashboard, mobile-design, landing-page) and the domain (fintech, saas, ecommerce).
- Prefer common Dribbble tags such as: ${PREFERRED_TAGS.join(', ')} — but only when they truly apply.
- No spammy, generic or unrelated tags, no duplicates, no "#".
Return: {"tags": ["...", "..."]}`,
};

export interface FieldPromptInput {
  field: ShotField;
  analysis: DesignAnalysis;
  options: GenerationOptions;
  current?: Partial<ShotContent>;
  /** Value being replaced; the model is asked for a different alternative. */
  previous?: ShotContent[ShotField];
}

export function buildFieldPrompt({ field, analysis, options, current = {}, previous }: FieldPromptInput): string {
  const parts = [
    analysisContext(analysis),
    currentContext(current, field),
    `\nTone: ${TONE_GUIDE[options.tone]}`,
    `\n${FIELD_INSTRUCTIONS[field](options)}`,
  ];
  if (previous !== undefined) {
    parts.push(
      `\nThe designer asked for an alternative. Do not repeat this previous ${field}:\n${JSON.stringify(previous)}`,
    );
  }
  return parts.join('\n');
}
