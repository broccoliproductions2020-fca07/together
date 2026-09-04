import type { TextStyle } from 'react-native';

/**
 * One typographic role, expressed so that BOTH targets keep their weights.
 *
 * Native bundles three static Schibsted files, so it sets `fontFamily` only —
 * a `fontWeight` next to it makes Android synthesize a second, fake bold
 * (AGENTS.md → design system). The web bundles ONE family carrying three real
 * weights, so there the weight is the only thing separating the roles; a web
 * theme that passes just a family name renders the whole component in the
 * inherited weight, which is how every headline on the landing page lost its
 * bold.
 */
export type ProductUiFont = {
  fontFamily: string;
  fontWeight?: TextStyle['fontWeight'];
};

export type ProductUiFonts = {
  body: ProductUiFont;
  semibold: ProductUiFont;
  bold: ProductUiFont;
};
