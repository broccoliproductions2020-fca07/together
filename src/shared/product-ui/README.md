# Portable Product UI

This folder owns presentation components that are deliberately shared by the
native Mica app and the web landing. A component here takes plain props and a
visual theme; it must not read a feature store, Firebase, navigation or device
APIs itself.

Native feature components remain thin data adapters. The landing resolves
`react-native` to `react-native-web`, so the same component renders as browser
DOM without copying its layout or state treatment.

Keep platform-bound surfaces out of this folder. `react-native-maps`, native
location sharing and device capture remain native; their landing
representation is a real app capture. Gesture-driven inputs remain native as
well, but a static, explicitly read-only visual may share their presentation
core when it does not imply that the landing can change app data.

Current shared surfaces: `ActivityChatPreview`, `PlanCardSummary`,
`TimeMatchingHighlight`, `AudienceSummary` and `TimeMatchingOverview`.

`TimeRangePickerPreview` lives beside the interactive picker. It reuses the
same theme, tick density and viewport geometry without bringing gesture or
adjustable controls onto the web landing.
