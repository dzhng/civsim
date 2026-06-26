// Campaign-map entities are coloured by exactly one of two schemes:
//   - FACTION colour: the realm's livery on city and army markers.
//   - ALLEGIANCE colour: friend/neutral/foe relative to the player, shown in
//     label icons (STATUS_CSS below).

/** 0 = friend (own or allied), 1 = neutral, 2 = foe (at war). */
export enum Allegiance { Friend = 0, Neutral = 1, Foe = 2 }

/** Allegiance colours for the 2D label icons: green friend, amber neutral,
 *  red foe. */
export const STATUS_CSS = ['#4ed163', '#edc74d', '#e0463a'];
