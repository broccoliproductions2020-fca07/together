import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { InteractionManager, Modal, Pressable, Text, View } from 'react-native';

import { AppButton } from '@/shared/components';

import type { ActivityDraft, SelectedPlace } from '../types';
import { FieldRow } from './FieldGroup';

const MODE_ACCENTS = {
  open: '#6E8BF7',
  soon: '#E0A23E',
  now: '#41C08D',
};

export interface LocationPickerProps {
  draft: ActivityDraft;
  onChange: (draft: ActivityDraft) => void;
  onOpenMapPicker?: (
    mode: ActivityDraft['mode'],
    onPick: (place: SelectedPlace) => void,
    options?: { focusCurrentLocation?: boolean; autoConfirm?: boolean; searchMode?: boolean },
  ) => void;
  /** `row` = a line inside a shared FieldGroup card; `card` = its own box. */
  variant?: 'card' | 'row';
}

function locationSummary(draft: ActivityDraft) {
  if (draft.place) return draft.place.name;
  if (draft.locationChoice === 'current') return 'Aktueller Standort';
  return draft.mode === 'open' ? 'Grobe Nähe' : 'Ort noch offen';
}

function applyPlace(draft: ActivityDraft, place: SelectedPlace): ActivityDraft {
  return {
    ...draft,
    place,
    locationChoice: place.source === 'current' ? 'current' : 'map',
    locationPrecision: draft.mode === 'open' && place.source === 'current' ? 'rough' : 'exact',
  };
}

export function LocationPicker({
  draft,
  onChange,
  onOpenMapPicker,
  variant = 'card',
}: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const accent = MODE_ACCENTS[draft.mode];

  return (
    <>
      {variant === 'row' ? (
        <FieldRow
          label="Ort"
          value={locationSummary(draft)}
          muted={!draft.place}
          accessibilityLabel="Ort auswählen"
          expandable
          onPress={() => setOpen(true)}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ort auswählen"
          className="rounded-2xl border border-white/10 px-4 py-4"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
          onPress={() => setOpen(true)}
        >
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text className="text-base font-bold text-white">{locationSummary(draft)}</Text>
              {draft.place?.address ? (
                <Text className="mt-1 text-sm text-white/60">{draft.place.address}</Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color={accent} />
          </View>
        </Pressable>
      )}

      <Modal
        transparent
        animationType="fade"
        visible={open}
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <View className="flex-1 justify-end bg-black/35">
          <View
            className="max-h-[82%] rounded-t-[28px] border border-white/10 px-5 pb-8 pt-4"
            style={{ backgroundColor: '#0E1116' }}
          >
            <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-white/20" />
            <View className="flex-row items-center justify-between">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Zurück zum Composer"
                className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
                onPress={() => setOpen(false)}
              >
                <Ionicons name="chevron-back" size={22} color="#F4F5F7" />
              </Pressable>
              <Text className="text-2xl font-bold text-white">Ort festlegen</Text>
              <View className="h-11 w-11" />
            </View>
            <Text className="mt-2 text-sm leading-5 text-white/55">
              Such nach einem Ort, nimm deinen aktuellen Standort oder wähle direkt auf der Karte.
            </Text>

            <View className="mt-5 gap-3">
              {/* Search first: it is the only option that can name a real place,
                  and it was previously reachable only by going through "Auf
                  Karte auswählen" — a search field hidden behind a map picker is
                  a search field nobody finds. `autoConfirm` returns the place on
                  the tap that chose it, and the map moves with it. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ort suchen"
                className="rounded-3xl border border-white/10 px-4 py-4"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                onPress={() => {
                  setOpen(false);
                  InteractionManager.runAfterInteractions(() => {
                    onOpenMapPicker?.(draft.mode, (place) => onChange(applyPlace(draft, place)), {
                      focusCurrentLocation: false,
                      autoConfirm: true,
                      searchMode: true,
                    });
                  });
                }}
              >
                <Text className="text-base font-bold text-white">Ort suchen</Text>
                <Text className="mt-1 text-sm text-white/55">
                  Café, Bar, Park — Treffer übernimmt den Ort direkt.
                </Text>
              </Pressable>

              {/* Resolves a real coordinate through the picker instead of storing
                  the CURRENT_LOCATION_PLACE placeholder, so the activity carries
                  an actual position and the camera can move there. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Aktuellen Standort verwenden"
                className="rounded-3xl border border-white/10 px-4 py-4"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                onPress={() => {
                  setOpen(false);
                  InteractionManager.runAfterInteractions(() => {
                    onOpenMapPicker?.(draft.mode, (place) => onChange(applyPlace(draft, place)), {
                      focusCurrentLocation: true,
                      autoConfirm: true,
                    });
                  });
                }}
              >
                <Text className="text-base font-bold text-white">Aktuellen Standort verwenden</Text>
                <Text className="mt-1 text-sm text-white/55">
                  Nimmt deine Position und zentriert die Karte darauf.
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ort auf Karte auswählen"
                className="rounded-3xl border border-white/10 px-4 py-4"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                onPress={() => {
                  setOpen(false);
                  InteractionManager.runAfterInteractions(() => {
                    onOpenMapPicker?.(draft.mode, (place) => onChange(applyPlace(draft, place)));
                  });
                }}
              >
                <Text className="text-base font-bold text-white">Auf Karte auswählen</Text>
                <Text className="mt-1 text-sm text-white/55">
                  Karte bewegen, Pin setzen und Ort übernehmen.
                </Text>
              </Pressable>

              <Pressable
                className="rounded-3xl border border-white/10 px-4 py-4"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                onPress={() => {
                  onChange({
                    ...draft,
                    place: undefined,
                    locationChoice: 'open',
                    locationPrecision: draft.mode === 'open' ? 'rough' : 'none',
                  });
                  setOpen(false);
                }}
              >
                <Text className="text-base font-bold text-white">Noch offen</Text>
                <Text className="mt-1 text-sm text-white/55">
                  Besonders passend für Open und Soon.
                </Text>
              </Pressable>
            </View>

            <View className="mt-5">
              <AppButton label="Zurück" variant="secondary" onPress={() => setOpen(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
