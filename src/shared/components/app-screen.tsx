import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

export interface AppScreenProps {
  children?: ReactNode;
  /** Wrap content in a ScrollView. Defaults to false. */
  scroll?: boolean;
  /** Extra classes for the background container. */
  className?: string;
  /** Extra classes for the inner content container. */
  contentClassName?: string;
  /** Which safe-area edges to apply. Defaults to all. */
  edges?: readonly Edge[];
}

/**
 * Standard screen wrapper: themed background, safe-area insets and consistent
 * padding. Render every screen's content inside an `AppScreen`.
 *
 * The background lives on a plain `View` (NativeWind styles core components);
 * `SafeAreaView` only handles insets.
 */
export function AppScreen({
  children,
  scroll = false,
  className,
  contentClassName,
  edges = ['top', 'left', 'right', 'bottom'],
}: AppScreenProps) {
  const content = <View className={`flex-1 px-5 py-4 ${contentClassName ?? ''}`}>{children}</View>;

  return (
    <View className={`flex-1 bg-background ${className ?? ''}`}>
      <SafeAreaView style={{ flex: 1 }} edges={edges}>
        {scroll ? (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {content}
          </ScrollView>
        ) : (
          content
        )}
      </SafeAreaView>
    </View>
  );
}
