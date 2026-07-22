export { SafetyProvider, useSafety } from './SafetyProvider';
export { SafetyConsoleHost } from './components/SafetyConsole';
export { SafetyConsolePanel } from './components/SafetyConsolePanel';
export { SafetyCompanionSheet } from './components/SafetyCompanionSheet';
export { SafetyAudienceSheet } from './components/SafetyAudienceSheet';
export { SafetyStatusPill } from './components/SafetyStatusPill';
export { SafetyStartSheet } from './components/SafetyStartSheet';
export { STATUS_COLOR, STATUS_WORD, agoLabel, signalStatus, worstStatus } from './safetyTheme';
export { getSafetySplitPanelHeight } from './safetyLayout';
export {
  deriveCompanionSignal,
  isCompanionConfirmationActive,
  isCompanionWatchingAlert,
} from './types';
export type {
  CompanionSignal,
  SafetyAlert,
  SafetyCompanionConfirmation,
  SafetySession,
  SafetyStatus,
} from './types';
