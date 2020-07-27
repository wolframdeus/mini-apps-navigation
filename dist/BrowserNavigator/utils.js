"use strict";function isObject(r){return"object"==typeof r&&null!==r&&!Array.isArray(r)}function isString(r){return"string"==typeof r}function isStringOrEmpty(r){return isString(r)||null==r||void 0===r}function isBrowserState(r){return isObject(r)&&"state"in r&&isObject(r.navigator)&&"number"==typeof r.navigator.locationIndex&&Array.isArray(r.navigator.locationsStack)&&r.navigator.locationsStack.every(function(r){if(!isObject(r))return!1;var t=Object.keys(r).length;return!(!Array.isArray(r.modifiers)||!r.modifiers.every(isString))&&(1===t||isString(r.view)&&isStringOrEmpty(r.modal)&&isStringOrEmpty(r.popup)&&isObject(r.params))})}Object.defineProperty(exports,"__esModule",{value:!0}),exports.isBrowserState=void 0,exports.isBrowserState=isBrowserState;