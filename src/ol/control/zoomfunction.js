goog.provide('ol.control.ZoomFunction');
goog.provide('ol.control.ZoomFunctionType');

goog.require('goog.math');
goog.require('ol.array');


/**
 * @typedef {function((number|undefined), number): (number|undefined)}
 */
ol.control.ZoomFunctionType;


/**
 * @param {Array.<number>} resolutions Resolutions.
 * @return {ol.control.ZoomFunctionType} Zoom function.
 */
ol.control.ZoomFunction.createSnapToResolutions = function(resolutions) {
  return function(resolution, delta) {
    if (goog.isDef(resolution)) {
      var oldLevel = ol.array.linearFindNearest(resolutions, resolution);
      var newLevel = goog.math.clamp(
          oldLevel + delta, 0, resolutions.length - 1);
      return resolutions[newLevel];
    } else {
      return undefined;
    }
  };
};


/**
 * @param {number} power Power.
 * @param {number} maxResolution Maximum resolution.
 * @param {number=} opt_maxLevel Maixmum level.
 * @return {ol.control.ZoomFunctionType} Zoom function.
 */
ol.control.ZoomFunction.createSnapToPower =
    function(power, maxResolution, opt_maxLevel) {
  return function(resolution, delta) {
    if (goog.isDef(resolution)) {
      var oldLevel = Math.floor(
          Math.log(maxResolution / resolution) / Math.log(power) + 0.5);
      var newLevel = Math.max(oldLevel + delta, 0);
      if (goog.isDef(opt_maxLevel)) {
        newLevel = Math.min(newLevel, opt_maxLevel);
      }
      return maxResolution / Math.pow(power, newLevel);
    } else {
      return undefined;
    }
  };
};
