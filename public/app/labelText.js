// public/app/labelText.js — measure and truncate canvas labels safely.

const segmenter = typeof Intl?.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

function graphemes(value) {
  const text = String(value ?? '');
  return segmenter
    ? [...segmenter.segment(text)].map(({ segment }) => segment)
    : [...text];
}

export function canvasLabelMaxWidth(viewportWidth) {
  const width = Number(viewportWidth);
  if (!Number.isFinite(width)) return 0;
  return Math.max(0, Math.min(320, width - 24));
}

export function fitCanvasLabel(value, measure, maxWidth) {
  const text = String(value ?? '');
  const width = Number(maxWidth);
  if (!text || typeof measure !== 'function' || !Number.isFinite(width) || width <= 0) return '';
  if (measure(text) <= width) return text;

  const ellipsis = '…';
  if (measure(ellipsis) > width) return '';
  const parts = graphemes(text);
  let low = 0;
  let high = Math.max(0, parts.length - 1);
  let fitted = ellipsis;

  while (low <= high) {
    const retained = Math.floor((low + high) / 2);
    const leading = Math.ceil(retained / 2);
    const trailing = Math.floor(retained / 2);
    const candidate = `${parts.slice(0, leading).join('')}${ellipsis}${
      trailing ? parts.slice(-trailing).join('') : ''
    }`;
    if (measure(candidate) <= width) {
      fitted = candidate;
      low = retained + 1;
    } else {
      high = retained - 1;
    }
  }

  return fitted;
}
