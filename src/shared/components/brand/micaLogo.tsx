import { View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

/**
 * Exact paths from the supplied Mica wordmark SVG (1024² source canvas). The
 * view boxes below are the measured tight bounds of those paths, not the
 * source canvas — the artwork sits off-centre in it, so rendering the full
 * canvas would pad the mark with invisible whitespace on every surface.
 *
 * The figure IS the `i`: its three parts double as the standalone app mark.
 */

const CA_PATH = `M596.026 441.204C600.636 440.529 609.154 440.774 613.79 441.319C641.505 444.574 661.205 457.336 678.395 478.667C667.3 488.512 651.419 500.79 639.631 509.969C627.73 498.781 616.593 491.783 599.543 494.583C588.19 496.421 578.046 502.73 571.377 512.099C564.372 522.096 561.64 534.472 563.788 546.488C565.949 558.001 573.097 567.496 582.735 573.941C592.685 580.499 604.848 582.794 616.504 580.313C638.574 575.805 657.434 553.79 666.889 534.631C674.517 518.021 680.31 501.999 690.351 486.519C711.811 453.438 752.064 433.709 791.228 443.382C802.38 446.136 811.072 451.014 820.557 457.465L820.699 444.317L872.999 444.327L872.981 634.769C855.525 634.676 838.069 634.678 820.614 634.774L820.653 619.747C808.814 627.68 801.009 631.547 787.346 634.911C749.387 641.824 721.444 628.671 696.855 600.311C712.492 584.828 722.354 569.415 731.735 549.806C749.956 603.48 822.333 584.648 817.931 534.389C816.893 522.671 811.195 511.861 802.115 504.381C793.027 496.828 781.251 493.307 769.508 494.632C738.856 498.058 733.43 524.14 722.54 546.767C716.795 558.758 709.752 570.084 701.537 580.539C694.591 589.222 688.681 595.105 680.782 602.62C661.635 620.835 642.393 633.474 615.548 636.116C589.215 638.707 564.812 630.878 544.384 614.251C523.81 597.611 510.682 573.484 507.885 547.171C505.445 521.876 513.191 496.652 529.406 477.086C545.88 456.648 569.896 443.712 596.026 441.204Z`;

const M_PATH = `M246.163 440.698C268.436 437.623 289.117 449.148 303.471 465.269C319.926 450.123 334.68 440.833 357.961 440.64C377.562 440.382 396.437 448.045 410.31 461.894C425.456 476.916 430.652 494.396 430.916 515.3C431.085 528.758 430.975 542.253 430.962 555.707L430.934 634.697L376.404 634.736L376.411 559.944C376.411 552.227 376.409 544.501 376.41 536.784C376.41 524.141 376.452 511.324 367.087 501.584C362.222 496.507 355.509 493.616 348.478 493.57C340.615 493.529 332.931 497.154 327.436 502.681C323.537 506.558 320.807 511.453 319.557 516.807C317.857 524.282 318.417 542.644 318.422 551.267L318.467 607.25L318.437 634.755L263.907 634.783L263.892 558.83C263.886 545.559 264.502 531.423 262.931 518.263C262.01 512.62 259.608 506.91 255.764 502.674C239.883 483.989 210.817 496.235 206.828 518.052C204.762 529.352 205.726 546.863 205.727 558.769L205.656 634.696L151.478 634.692L151.476 443.475L205.503 443.487L205.542 458.401C218.202 447.955 229.793 442.362 246.163 440.698Z`;

/** Torso plus the raised right arm — the tall stroke that carries the `i`. */
const FIGURE_BODY_PATH = `M550.183 389.137C550.658 389.107 551.133 389.084 551.609 389.069C557.703 388.886 563.25 390.883 567.646 395.158C571.963 399.39 574.411 405.172 574.445 411.218C574.605 430.823 557.423 431.754 544.199 438.311C521.043 449.793 503.675 477.944 498.757 502.693C495.328 519.949 496.51 541.272 496.537 558.992L496.526 634.696L470.125 634.712L445.249 634.779L445.268 560.265C445.324 524.604 441.921 495.581 468.638 467.516C483.469 451.938 501.607 447.57 514.855 431.294C528.216 414.879 524.961 393.128 550.183 389.137Z`;

/** Raised left arm. */
const FIGURE_ARM_PATH = `M390.885 388.576C432.706 384.669 415.714 448.204 469.594 453.249C458.187 464.378 452.625 469.27 445.032 484.405C443.818 486.805 442.756 489.661 441.74 492.18C436.054 469.605 422.212 448.509 401.358 437.364C396.439 434.735 390.017 433.01 384.77 430.535C372.674 424.828 369.497 411.698 375.234 400.121C378.654 393.512 383.963 390.573 390.885 388.576Z`;

/** Head — also the tittle of the `i`. Measured as an exact 53.43² circle. */
const FIGURE_HEAD_PATH = `M471.791 389.215C486.473 388.174 499.231 399.204 500.322 413.882C501.412 428.561 490.425 441.356 475.751 442.496C461.006 443.641 448.137 432.59 447.041 417.842C445.945 403.094 457.04 390.262 471.791 389.215Z`;

/**
 * Sampled from the delivered app icons (light and dark render averaged). The
 * figure is the only place the brand carries colour, so these three values
 * live here rather than in the neutral brand tokens.
 */
export const MICA_FIGURE_COLORS = {
  arm: '#35BA84',
  head: '#E9A02B',
  body: '#4772F8',
} as const;

/**
 * Draw order is body → arm → head so the head sits on top; the loader's
 * stagger uses `beat` instead, which reads left to right like a wave.
 */
export const MICA_FIGURE_PARTS = [
  { key: 'body', d: FIGURE_BODY_PATH, tone: MICA_FIGURE_COLORS.body, beat: 2 },
  { key: 'arm', d: FIGURE_ARM_PATH, tone: MICA_FIGURE_COLORS.arm, beat: 0 },
  { key: 'head', d: FIGURE_HEAD_PATH, tone: MICA_FIGURE_COLORS.head, beat: 1 },
] as const;

// Measured tight bounds, not the 1024² source canvas.
export const MICA_WORDMARK_VIEW_BOX = '151.48 388.4 721.52 248.32';
export const MICA_WORDMARK_ASPECT_RATIO = 721.52 / 248.32;
export const MICA_FIGURE_VIEW_BOX = '372.46 388.4 201.98 246.38';
export const MICA_FIGURE_ASPECT_RATIO = 201.98 / 246.38;

export type MicaFigureTone = 'inherit' | 'brand';

export type MicaWordmarkProps = {
  width: number;
  color: string;
  /**
   * `brand` colours the figure green/amber/blue while the letters keep
   * `color`. Reserved for the brand stages (auth, welcome); everywhere else
   * the mark stays monochrome so it inherits the surface it sits on.
   */
  figureTone?: MicaFigureTone;
  accessibilityLabel?: string;
};

export function MicaWordmark({
  width,
  color,
  figureTone = 'inherit',
  accessibilityLabel = 'Mica',
}: MicaWordmarkProps) {
  const height = width / MICA_WORDMARK_ASPECT_RATIO;
  const brand = figureTone === 'brand';

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      style={{ height, width }}
    >
      <Svg
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        viewBox={MICA_WORDMARK_VIEW_BOX}
        width="100%"
      >
        <G stroke="none">
          <Path d={M_PATH} fill={color} />
          <Path d={CA_PATH} fill={color} />
          {MICA_FIGURE_PARTS.map((part) => (
            <Path d={part.d} fill={brand ? part.tone : color} key={part.key} />
          ))}
        </G>
      </Svg>
    </View>
  );
}

export type MicaFigureProps = {
  /** Height in px. Width follows the mark's own 0.82 aspect ratio. */
  size: number;
  color: string;
  tone?: MicaFigureTone;
  accessibilityLabel?: string;
};

/** The figure alone: app mark, loader and the Core button's rest state. */
export function MicaFigure({
  size,
  color,
  tone = 'inherit',
  accessibilityLabel = 'Mica',
}: MicaFigureProps) {
  const width = size * MICA_FIGURE_ASPECT_RATIO;
  const brand = tone === 'brand';

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      style={{ height: size, width }}
    >
      <Svg
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        viewBox={MICA_FIGURE_VIEW_BOX}
        width="100%"
      >
        <G stroke="none">
          {MICA_FIGURE_PARTS.map((part) => (
            <Path d={part.d} fill={brand ? part.tone : color} key={part.key} />
          ))}
        </G>
      </Svg>
    </View>
  );
}
