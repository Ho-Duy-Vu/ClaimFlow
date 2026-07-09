import type { useTranslations } from 'next-intl';

type Translator = ReturnType<typeof useTranslations>;

/**
 * Map a fraud-flag value to a human-friendly label.
 *
 * The agent emits a mix of:
 *  - snake_case codes from the LLM (e.g. `low_description_quality`)
 *  - free-text Vietnamese sentences (e.g. "Mô tả sự kiện quá sơ sài")
 *
 * `t` must be a translator scoped to the `fraudFlags` namespace. Known codes are
 * translated; unknown snake_case codes are humanized (underscores → spaces, Title
 * Case); anything already human-readable is returned unchanged.
 */
export function fraudFlagLabel(flag: string, t: Translator): string {
  const key = (flag ?? '').trim();
  if (!key) return '';

  const isCode = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(key); // snake_case only
  if (!isCode) return flag; // already a human sentence (e.g. Vietnamese from agent)

  if (t.has(key)) return t(key);

  // Unknown code → humanize
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
