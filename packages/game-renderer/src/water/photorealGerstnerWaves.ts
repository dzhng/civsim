import { bakeGerstnerWaves } from "./gerstnerField";
/** CPU dispersion and phase preparation shared by the photoreal TSL and native
 * water paths. Keep double precision until each shader embeds its constants. */
export function photorealGerstnerWaves() {
  return bakeGerstnerWaves().map((wave, i) => {
    const k = 6.2831853 / wave.wavelength;
    const hash = Math.sin(i * 127.1 + wave.wavelength * 3.71) * 43758.5453;
    return { ...wave, k, omega: Math.sqrt(9.81 * k), phase: (hash - Math.floor(hash)) * 6.2831853 };
  });
}
