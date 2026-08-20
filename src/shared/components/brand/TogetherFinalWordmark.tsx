import { TOGETHER_BRAND } from './brandTokens';
import { MicaWordmark, type MicaFigureTone } from './micaLogo';

export type TogetherFinalWordmarkProps = {
  width?: number;
  color?: string;
  figureTone?: MicaFigureTone;
};

/** The Mica wordmark, rendered statically where motion would distract. */
export function TogetherFinalWordmark({
  width = 292,
  color = TOGETHER_BRAND.paper,
  figureTone = 'inherit',
}: TogetherFinalWordmarkProps) {
  return <MicaWordmark color={color} figureTone={figureTone} width={width} />;
}
