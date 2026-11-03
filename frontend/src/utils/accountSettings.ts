import type { AccountSettings } from '../types';
import { setMetalCards } from './metalCards';
import { setVideoViaServer } from './videoRoute';

/** A Google account keeps its display settings on the server; copy them into this browser on sign-in. */
export function applyAccountSettings(settings: AccountSettings): void {
  setMetalCards(settings.metal_cards);
  setVideoViaServer(settings.video_via_server);
}
