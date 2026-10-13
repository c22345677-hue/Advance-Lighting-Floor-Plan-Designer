// Camera lenses: focal length → horizontal angle of view, for the cone drawn in front of a camera.

/** Common prime focal lengths offered in the lens menu, mm. */
export const COMMON_LENSES_MM = [10, 12, 14, 18, 24, 28, 35, 50, 85, 100, 135, 200, 300];

export const DEFAULT_LENS_MM = 35;
export const LENS_RANGE_MM = { min: 2, max: 800 };

/** Super 35 sensor width (mm), the usual cinema format; used until cameras get a sensor setting. */
export const SUPER35_WIDTH_MM = 24.89;

/** Horizontal angle of view in degrees: 2·atan(sensor width / 2f). */
export function horizontalFovDeg(focalMm: number, sensorWidthMm = SUPER35_WIDTH_MM): number {
  return (2 * Math.atan(sensorWidthMm / (2 * focalMm)) * 180) / Math.PI;
}

/** Zoom ranges offered for a zoom lens, mm. */
export const COMMON_ZOOMS_MM: { minMm: number; maxMm: number }[] = [
  { minMm: 16, maxMm: 35 },
  { minMm: 18, maxMm: 55 },
  { minMm: 24, maxMm: 70 },
  { minMm: 24, maxMm: 105 },
  { minMm: 28, maxMm: 135 },
  { minMm: 70, maxMm: 200 },
];
