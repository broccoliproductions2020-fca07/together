import type { SelectedPlace } from '@/features/activities/types';

export const mockComposerPlaces: SelectedPlace[] = [
  {
    id: 'p_biergarten_park',
    name: 'Biergarten am Park',
    address: 'Am Park 4',
    latitude: 52.5208,
    longitude: 13.4095,
    source: 'mock',
  },
  {
    id: 'p_cafe_ecke',
    name: 'Cafe Ecke',
    address: 'Ecke Marktstrasse',
    latitude: 52.5189,
    longitude: 13.4058,
    source: 'mock',
  },
  {
    id: 'p_bar_mitte',
    name: 'Bar Mitte',
    address: 'Mitte 12',
    latitude: 52.5222,
    longitude: 13.4135,
    source: 'mock',
  },
];

export const mockCurrentPlace: SelectedPlace = {
  id: 'p_current',
  name: 'Aktueller Standort',
  address: 'Nähe Glockenbachviertel',
  source: 'current',
};
