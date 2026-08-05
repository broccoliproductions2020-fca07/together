import Animated, { LinearTransition, useReducedMotion } from 'react-native-reanimated';

import type { AgendaSection as AgendaSectionData, Plan } from '../types/calendar.types';
import { AgendaSection } from './AgendaSection';

export interface AgendaListProps {
  sections: AgendaSectionData[];
  expandedPlanId: string | null;
  onTogglePlan: (planId: string) => void;
  onOpenChat: (plan: Plan) => void;
  onEditActivity: (plan: Plan) => void;
  /** Called after layout with each section's y-offset within the scroll content. */
  onSectionLayout?: (key: string, y: number) => void;
}

export function AgendaList({
  sections,
  expandedPlanId,
  onTogglePlan,
  onOpenChat,
  onEditActivity,
  onSectionLayout,
}: AgendaListProps) {
  const reducedMotion = useReducedMotion();
  // Sections shift smoothly when a card above them expands/collapses.
  const layout = reducedMotion ? undefined : LinearTransition.duration(220);

  return (
    <Animated.View className="gap-6 px-4 pt-2" layout={layout}>
      {sections.map((section, index) => (
        <Animated.View
          key={section.key}
          layout={layout}
          onLayout={(e) => onSectionLayout?.(section.key, e.nativeEvent.layout.y)}
        >
          <AgendaSection
            index={index}
            section={section}
            expandedPlanId={expandedPlanId}
            onTogglePlan={onTogglePlan}
            onOpenChat={onOpenChat}
            onEditActivity={onEditActivity}
          />
        </Animated.View>
      ))}
    </Animated.View>
  );
}
