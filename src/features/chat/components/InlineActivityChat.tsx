import { useState } from 'react';
import { View } from 'react-native';

import type { ProposalData } from '../types';
import { ChatInputBar } from './ChatInputBar';
import { ChatThread } from './ChatThread';
import { ProposalComposer } from './ProposalComposer';
import { useActivityChat } from '../useActivityChat';

/**
 * Chat embedded directly inside the activity detail sheet (shown once joined).
 * Fills the available height of its parent — wrap it in a `flex-1` container.
 * Uses the same ChatProvider state as the full-screen chat Modal, and must be
 * handed the same accent so one room never renders in two colours.
 */
export function InlineActivityChat({
  activityId,
  accent,
  onCreateActivity,
}: {
  activityId: string;
  /** The room's colour. Required — see AGENTS.md → chat colour model. */
  accent: string;
  onCreateActivity?: (roomId: string, messageId: string, proposal: ProposalData) => void;
}) {
  const { sendMessage, sendProposal, getRoom } = useActivityChat();
  const [proposalOpen, setProposalOpen] = useState(false);
  // Proposals belong to planning rounds — inside an activity chat the plan
  // already exists, so the entry stays hidden there.
  const isGroup = getRoom(activityId)?.type === 'group';

  return (
    <View className="flex-1">
      <ChatThread
        activityId={activityId}
        accent={accent}
        onCreateActivity={onCreateActivity}
        contentPaddingHorizontal={4}
      />
      <ChatInputBar
        accent={accent}
        onSend={(text) => sendMessage(activityId, text)}
        onProposal={isGroup ? () => setProposalOpen(true) : undefined}
      />
      <ProposalComposer
        visible={proposalOpen}
        accent={accent}
        onClose={() => setProposalOpen(false)}
        onSubmit={(data) => {
          sendProposal(activityId, data);
          setProposalOpen(false);
        }}
      />
    </View>
  );
}
