/**
 * The camera is permanently tilted by this many degrees — there is no flat
 * view and no toggle any more. Enough to read building height without turning
 * the map into a diorama; lower means more top-down. Independent of heading:
 * turning the map is the user's two-finger gesture.
 *
 * Everything that fakes ground contact derives from it (see
 * MAP_GROUND_VERTICAL_SCALE), so this number is the only place to change the
 * viewing angle.
 */
export const MAP_PERSPECTIVE_PITCH = 34;
/** Vertical squash of anything drawn as lying ON the ground, e.g. a marker's
 * shadow ellipse. Must follow the pitch or the contact illusion breaks. */
export const MAP_GROUND_VERTICAL_SCALE = Math.cos((MAP_PERSPECTIVE_PITCH * Math.PI) / 180);
export const MAP_VIEW_DOWN_SCALE = Math.sin((MAP_PERSPECTIVE_PITCH * Math.PI) / 180);
