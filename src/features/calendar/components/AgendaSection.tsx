import { Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import type { AgendaSection as AgendaSectionData, Plan } from '../types/calendar.types';
import { dateKey } from '../utils/formatPlanTime';
import { PlanCard } from './PlanCard';

export interface AgendaSectionProps {
  section: AgendaSectionData;
  index: number;
  expandedPlanId: string | null;
  onTogglePlan: (planId: string) => void;
  onOpenChat: (plan: Plan) => void;
}

export function AgendaSection({
  section,
  index,
  expandedPlanId,
  onTogglePlan,
  onOpenChat,
}: AgendaSectionProps) {
  const reducedMotion = useReducedMotion();
  const isToday = section.key === dateKey(new Date());

  return (
    <Animated.View
      className="gap-3"
      entering={reducedMotion ? undefined : FadeInDown.delay(index * 60).duration(260)}
      layout={reducedMotion ? undefined : LinearTransition.duration(220)}
    >
      <View className="flex-row items-center gap-1.5">
        {isToday ? <View className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
        <Text
          className={`text-xs font-bold uppercase tracking-wide ${
            isToday ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          {section.label}
        </Text>
      </View>
      <View className="gap-3">
        {section.plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            expanded={expandedPlanId === plan.id}
            onToggle={() => onTogglePlan(plan.id)}
            onOpenChat={onOpenChat}
          />
        ))}
      </View>
    </Animated.View>
  );
}
