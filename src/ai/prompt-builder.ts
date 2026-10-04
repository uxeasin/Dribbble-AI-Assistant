// Provider-neutral prompts. Providers decide how to transport them.

import type { DesignAnalysis, GenerationOptions, ShotContent, ShotField, Tone } from '../types';

export const SYSTEM_PROMPT = `You are an experienced Dribbble content assistant and SEO copywriter who has written thousands of shot titles, descriptions and tags for professional UI/UX designers. Your writing ranks on Google and is quoted by AI answer engines because it is clear, specific and factual.

Principles:
- Describe only what can reasonably be seen or inferred from the design. Never invent features, metrics, clients or functionality.
- Use precise design terminology (layout, hierarchy, components, navigation patterns, data visualisation, typography, colour).
- No clickbait, no hype, no emojis, no hashtags, no marketing fluff.
- Always reply with a single JSON object and nothing else.`;

export const PREFERRED_TAGS = [
  'ui',
  'ux',
  'web design',
  'mobile design',
  'app design',
  'dashboard',
  'saas',
  'fintech',
  'ecommerce',
  'branding',
  'landing page',
  'product design',
  'illustration',
  'typography',
  'design system',
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

const FIELD_RULES: Record<ShotField, (options: GenerationOptions) => string> = {
  title: () => `TITLE
- 3 to 8 words, Title Case, descriptive and specific (e.g. "Modern SaaS Analytics Dashboard").
- Lead with the main search phrase someone would type to find this design (product type + domain + format).
- No quotes, no trailing punctuation, no emojis, no clickbait.`,

  description: () => `DESCRIPTION — long-form, optimised for search engines (SEO), answer engines (AEO) and generative AI search (GEO)
- 200 to 350 words, well structured and easy to scan. Plain text only: no markdown symbols (#, *, **), no hashtags, no emojis.
- Start with an intro paragraph (no title above it) whose first sentence directly answers "What is this?", naming the design type, the product and its industry with the main search phrase (e.g. "This is a mobile app UI design for an electric scooter rental service…"). Answer engines quote this sentence, so it must make sense on its own.
- Then 3 or 4 sections. Each section is a short title (2 to 4 words, Title Case, no punctuation) on its own line, followed directly on the next line by its content. Separate sections with one blank line. Use section titles such as "The Challenge", "Key Screens", "Design Approach", "Visual Language", "Who It's For".
- Section content is one short paragraph (2 to 4 sentences), except "Key Screens" (or "Key Features"), which is 3 to 6 lines that each start with "• " and briefly describe one visible screen or feature.
- Together the sections cover: the problem or user need; the key screens and UI components that are visible; the UX decisions (navigation, hierarchy, layout, interaction patterns); the visual language (colour palette, typography, imagery, style); and who the product is for.
- Weave in relevant keywords and close synonyms naturally (product type, platform, industry, style, "UI/UX design", "app design", "web design" as applicable). Never keyword-stuff or repeat a phrase unnaturally.
- Use concrete, factual, entity-rich wording that AI search engines can cite: name the product category, platform (iOS, Android, web), industry and design patterns explicitly.
- Do not invent features, metrics, client names or results that cannot be seen in the image. No hype or superlatives.
- Finish with one sentence summarising the design's value for its users.`,

  tags: (options) => `TAGS — exactly ${options.tagCount}
- Lowercase; write multi-word tags with spaces, never hyphens (e.g. "web design", "landing page", "mobile app").
- Highly relevant to this specific design; mix the discipline (ui, ux, product design), the format (dashboard, mobile design, landing page) and the domain (fintech, saas, ecommerce).
- Use the phrases people actually search for, so the tags double as SEO keywords.
- Prefer common Dribbble tags such as: ${PREFERRED_TAGS.join(', ')} — but only when they truly apply.
- No spammy, generic or unrelated tags, no duplicates, no "#".`,
};

const FIELD_RETURN: Record<ShotField, string> = {
  title: '{"title": "..."}',
  description: '{"description": "..."}',
  tags: '{"tags": ["...", "..."]}',
};

/**
 * Everything in one request: analyse the image and write all three fields.
 * Keeps usage at one call per shot, which matters on free API tiers.
 */
export function buildShotPrompt(options: GenerationOptions): string {
  return `${ANALYSIS_PROMPT}

Then, using that analysis, write the Dribbble shot content.
Tone: ${TONE_GUIDE[options.tone]}

${FIELD_RULES.title(options)}

${FIELD_RULES.description(options)}

${FIELD_RULES.tags(options)}

Return one JSON object:
{
  "analysis": { ...the analysis keys above... },
  "title": "...",
  "description": "...",
  "tags": ["...", "..."]
}`;
}

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
    `\nWrite the shot ${FIELD_RULES[field](options)}\nReturn: ${FIELD_RETURN[field]}`,
  ];
  if (previous !== undefined) {
    parts.push(
      `\nThe designer asked for an alternative. Do not repeat this previous ${field}:\n${JSON.stringify(previous)}`,
    );
  }
  return parts.join('\n');
}
