import { TOGETHER_BRAND } from './brandTokens';
import { ComoWordmark } from './comoLogo';

export type TogetherFinalWordmarkProps = {
  width?: number;
  color?: string;
};

/** The supplied Como wordmark, rendered statically where motion would distract. */
export function TogetherFinalWordmark({
  width = 292,
  color = TOGETHER_BRAND.paper,
}: TogetherFinalWordmarkProps) {
  return <ComoWordmark color={color} width={width} />;
}
