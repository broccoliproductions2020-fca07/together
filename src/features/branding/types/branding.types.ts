export type TogetherLogoAppearance = 'light' | 'dark';

export type MorphPoint = Readonly<{
  x: number;
  y: number;
}>;

export type TogetherAnimatedIconProps = {
  width?: number;
  height?: number;
  appearance?: TogetherLogoAppearance;
  autoplay?: boolean;
  restartKey?: number;
  reducedMotion?: boolean;
  onAnimationComplete?: () => void;
};
