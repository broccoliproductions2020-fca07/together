import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

/**
 * One card, several rows, hairlines between them.
 *
 * The composer used to stack every control as its own filled box under its own
 * bold caption — ten grey slabs in a ladder, all the same visual weight, so
 * nothing said what mattered. Grouping the rows that belong together does two
 * things at once: it removes the captions (a row reading "Ort · Café Central"
 * needs no heading announcing that it is about place) and it makes the group
 * itself the unit of meaning.
 */
export function FieldGroup({ children }: { children: ReactNode }) {
  return (
    <View
      className="overflow-hidden rounded-2xl border border-white/10"
      style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
    >
      {children}
    </View>
  );
}

/** Divider between rows. Explicit rather than a `:first-child` trick, because
 * rows are conditionally rendered and a CSS-like rule would leave a stray line
 * at the top whenever the first row is hidden. */
export function FieldDivider() {
  return <View className="h-px bg-white/[0.07]" />;
}

export interface FieldRowProps {
  label: string;
  /** Right-aligned current value. Absent = the row carries its own control. */
  value?: string;
  /** Dim the value when it is a placeholder rather than a real answer. */
  muted?: boolean;
  accessibilityLabel?: string;
  onPress?: () => void;
  /** Shows a chevron and, when expanded, turns it. */
  expandable?: boolean;
  expanded?: boolean;
  /** Rendered in place of the chevron — a Switch, for instance. */
  trailing?: ReactNode;
  /** Unfolded content below the row, inside the same card. */
  children?: ReactNode;
}

export function FieldRow({
  label,
  value,
  muted = false,
  accessibilityLabel,
  onPress,
  expandable = false,
  expanded = false,
  trailing,
  children,
}: FieldRowProps) {
  const body = (
    <View className="min-h-[50px] flex-row items-center gap-3 px-4 py-3">
      <Text className="text-[15px] font-semibold text-white">{label}</Text>
      <View className="flex-1" />
      {value ? (
        <Text
          className={`text-[15px] ${muted ? 'text-white/35' : 'font-semibold text-white/75'}`}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : null}
      {trailing}
      {expandable ? (
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={15}
          color="rgba(244,245,247,0.32)"
        />
      ) : null}
    </View>
  );

  return (
    <View>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={expandable ? { expanded } : undefined}
          onPress={onPress}
          className="active:opacity-70"
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
      {children ? <View className="px-4 pb-3.5">{children}</View> : null}
    </View>
  );
}
