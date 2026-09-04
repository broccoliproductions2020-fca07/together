import { FONT } from '../theme/typography';

import type { ProductUiFonts } from './types';

/**
 * The app's three cuts, resolved once. Every native call site passes this
 * instead of spelling the mapping out again — four hand-written copies of the
 * same three lines is how one surface quietly ends up on a different weight.
 *
 * Native only. The landing passes its own, because the web family is a single
 * file whose roles are separated by `fontWeight`.
 */
export const NATIVE_FONTS: ProductUiFonts = {
  body: { fontFamily: FONT.medium },
  semibold: { fontFamily: FONT.semibold },
  bold: { fontFamily: FONT.bold },
};
