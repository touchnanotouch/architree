// Module

import { GOLDEN_ANGLE } from "../core/config.js";


// Public

/**
    * Generate the next group colour using the golden angle
    *
    * @param {number} index Sequential group index (0, 1, 2, ...)
    * @returns {string} HSL colour string
*/
export function nextGroupColor(index) {
    const hue = (index * GOLDEN_ANGLE) % 360;

    return "hsl(" + hue + ", 70%, 55%)";
}
