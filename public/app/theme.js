const dark = {
  bg: '#0c0f13',
  bgPanel: '#12161c',
  line: '#1d242d',
  text: '#c8d0d8',
  muted: '#76828e',
  link: 'rgba(138,155,176,.35)',
  linkHi: '#38e1c6',
  nodeStroke: 'rgba(255,255,255,.10)',
  glow: 'rgba(56,225,198,.25)',
  inbound: '#73a9ff',
  outbound: '#f0b55b',
  bidirectional: '#ab92f5',
  focus: '#e4ebf3',
};

const black = {
  bg: '#000000',
  bgPanel: '#0a0a0a',
  line: '#141414',
  text: '#d7dde3',
  muted: '#747980',
  link: 'rgba(120,132,150,.30)',
  linkHi: '#38e1c6',
  nodeStroke: 'rgba(255,255,255,.06)',
  glow: 'rgba(56,225,198,.20)',
  inbound: '#73a9ff',
  outbound: '#f0b55b',
  bidirectional: '#ab92f5',
  focus: '#e4ebf3',
};

export const THEMES = Object.freeze({
  dark: Object.freeze(dark),
  black: Object.freeze(black),
});

const cssName = (key) => `--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;

export function apply(themeName, rootEl) {
  const name = Object.hasOwn(THEMES, themeName) ? themeName : 'dark';
  const tokens = THEMES[name];

  if (rootEl?.style?.setProperty) {
    for (const [key, value] of Object.entries(tokens)) {
      rootEl.style.setProperty(cssName(key), value);
    }
    if (rootEl.dataset) rootEl.dataset.theme = name;
  }

  return tokens;
}
