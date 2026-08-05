import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { FONT, TYPE } from '@/shared/theme';

const EASE = Easing.bezier(0.22, 1, 0.36, 1);
const PAPER = '#F4F5F7';
const MUTED = 'rgba(244,245,247,0.5)';
const FIELD = 'rgba(20,25,33,0.66)';
const BORDER = 'rgba(244,245,247,0.12)';
const DANGER = '#FCA5A5';
const OK = '#41C08D';

export interface FloatingLabelFieldProps extends Omit<
  TextInputProps,
  'style' | 'value' | 'onChangeText' | 'placeholder'
> {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  accent: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Trailing control (e.g. the password eye toggle). */
  rightSlot?: ReactNode;
  /** Field-level validation message. Renders below the field and reddens it. */
  error?: string | null;
  /** Quiet helper line below the field, shown while there is no error. */
  hint?: string | null;
  /** Passed validation — a restrained check, never a full green field. */
  valid?: boolean;
  inputRef?: RefObject<TextInput | null>;
}

/**
 * Modern floating-label input: the label rests inside the empty field and
 * animates up to a caption on focus/fill, the border lifts to the accent with a
 * soft glow, and everything uses the brand typeface. One cohesive, professional
 * field the whole auth surface is built from.
 *
 * Validation is part of the field, not an afterthought stacked at the bottom of
 * the form: the message sits directly under the input it belongs to and is
 * announced politely, which is what a screen reader user needs to fix it.
 */
export function FloatingLabelField({
  label,
  value,
  onChangeText,
  accent,
  icon,
  rightSlot,
  error,
  hint,
  valid = false,
  inputRef,
  editable = true,
  onFocus,
  onBlur,
  ...inputProps
}: FloatingLabelFieldProps) {
  const reduced = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const float = useSharedValue(value ? 1 : 0);
  const focusV = useSharedValue(0);
  const errorV = useSharedValue(error ? 1 : 0);

  useEffect(() => {
    const target = focused || value.length > 0 ? 1 : 0;
    float.value = reduced ? target : withTiming(target, { duration: 170, easing: EASE });
  }, [focused, float, reduced, value]);

  useEffect(() => {
    focusV.value = reduced
      ? focused
        ? 1
        : 0
      : withTiming(focused ? 1 : 0, { duration: 160, easing: EASE });
  }, [focusV, focused, reduced]);

  useEffect(() => {
    const target = error ? 1 : 0;
    errorV.value = reduced ? target : withTiming(target, { duration: 180, easing: EASE });
  }, [error, errorV, reduced]);

  const containerStyle = useAnimatedStyle(() => {
    const base = interpolateColor(focusV.value, [0, 1], [BORDER, accent]);
    return {
      borderColor: interpolateColor(errorV.value, [0, 1], [base, DANGER]),
      shadowOpacity: Math.max(focusV.value * 0.4, errorV.value * 0.3),
    };
  });

  const glowStyle = useAnimatedStyle(() => ({
    shadowColor: errorV.value > 0.5 ? DANGER : accent,
  }));

  const labelStyle = useAnimatedStyle(() => {
    const base = interpolateColor(focusV.value, [0, 1], [MUTED, accent]);
    return {
      transform: [{ translateY: interpolate(float.value, [0, 1], [0, -17]) }],
      fontSize: interpolate(float.value, [0, 1], [TYPE.body.fontSize, TYPE.micro.fontSize]),
      color: interpolateColor(errorV.value, [0, 1], [base, DANGER]),
    };
  });

  const message = error ?? hint ?? null;

  return (
    <View>
      <Animated.View style={[styles.field, glowStyle, containerStyle]}>
        {icon ? (
          <Ionicons name={icon} size={19} color={error ? DANGER : focused ? accent : MUTED} />
        ) : null}
        <View style={styles.col}>
          <Animated.Text pointerEvents="none" numberOfLines={1} style={[styles.label, labelStyle]}>
            {label}
          </Animated.Text>
          <TextInput
            {...inputProps}
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            editable={editable}
            showSoftInputOnFocus
            placeholder=""
            placeholderTextColor="transparent"
            selectionColor={accent}
            style={styles.input}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
          />
        </View>
        {valid && !error ? (
          <Animated.View entering={reduced ? undefined : FadeIn.duration(180)}>
            <Ionicons name="checkmark-circle" size={19} color={OK} />
          </Animated.View>
        ) : null}
        {rightSlot}
      </Animated.View>

      {message ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(160)}
          exiting={reduced ? undefined : FadeOut.duration(120)}
        >
          <Text
            accessibilityLiveRegion={error ? 'polite' : 'none'}
            accessibilityRole={error ? 'alert' : 'text'}
            style={[styles.message, error ? styles.messageError : null]}
          >
            {message}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  col: {
    flex: 1,
    height: 46,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  field: {
    alignItems: 'center',
    backgroundColor: FIELD,
    borderRadius: 16,
    borderWidth: 1.5,
    elevation: 0,
    flexDirection: 'row',
    gap: 12,
    minHeight: 62,
    paddingHorizontal: 16,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 11,
  },
  input: {
    color: PAPER,
    fontFamily: FONT.medium,
    fontSize: TYPE.body.fontSize,
    padding: 0,
    paddingBottom: 8,
  },
  label: {
    bottom: 9,
    fontFamily: FONT.medium,
    left: 0,
    position: 'absolute',
  },
  message: {
    color: MUTED,
    fontFamily: FONT.medium,
    ...TYPE.caption,
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  messageError: {
    color: DANGER,
  },
});
