import {
  EventListener,
  EventType,
  EventListenerFunc,
  NavigatorLocationType,
  ChangeLocationResult,
  NavigatorCompleteLocationType, SetLocationOptions, InternalModifierType,
} from '../types';
import {
  createLogger,
  formatLocation,
  isTechLocation,
} from '../utils';
import {NavigatorConstructorProps} from './types';
import {filterStringArray} from './utils';

/**
 * List of modifiers which are not allowed to use on rool location
 * @type {(string)[]}
 */
const forbiddenRootModifiers: InternalModifierType[] = [
  'skip', 'back', 'forward', 'replace',
];

/**
 * Class which represents navigation core. Recommended only for creating
 * new navigator
 * @see https://github.com/wolframdeus/mini-apps-navigation/blob/master/src/BrowserNavigator/BrowserNavigator.ts#L18
 */
export class Navigator {
  /**
   * List of bound listeners
   * @type {EventListener[]}
   */
  private listeners: EventListener[] = [];

  /**
   * Locations stack. Represents locations history. First entry should
   * be a location which has modifier "root" to let navigator know this is
   * first entry
   * @type {{modifiers: string[]}[]}
   */
  locationsStack: NavigatorCompleteLocationType[] = [{
    modifiers: ['root'],
  }];

  /**
   * Current stack location index
   * @type {number}
   */
  locationIndex = 0;

  /**
   * Logs message into console
   */
  private readonly log: (...messages: any[]) => void;

  constructor(props: NavigatorConstructorProps = {}) {
    const {log = false} = props;

    this.log = log ? createLogger('Navigator') : () => {
    };
    this.log('Instance created');
  }

  /**
   * Calls listeners which are bound to "location-changed" event
   */
  private emitLocationChanged() {
    const location = this.location;

    this.listeners.forEach(({event, listener}) => {
      if (event === 'location-changed') {
        listener(location);
      }
    });
    this.log('Emitted location change:', location);
  }

  /**
   * Inserts location on current position, removing each location
   * after it. Works the same as browser history state push
   * @param {NavigatorCompleteLocationType} location
   * @param options
   */
  private insertLocation(
    location: NavigatorCompleteLocationType,
    options: SetLocationOptions = {},
  ): ChangeLocationResult {
    const formattedLocation = formatLocation(location);

    // Increase location index, due to new location was pushed
    this.locationIndex++;

    // Take all locations before current one including it and append new 
    // location
    this.locationsStack = [
      ...this.locationsStack.slice(0, this.locationIndex),
      formattedLocation,
    ];

    this.log(
      'Pushed location to stack. Location:', location,
      'Current stack:', this.locationsStack,
    );

    if (!options.silent) {
      this.emitLocationChanged();
    }

    return {delta: 1, location: formattedLocation};
  }

  /**
   * Replaces last added location
   * @param {NavigatorLocationType} location
   * @param {SetLocationOptions} options
   */
  private replaceLocation(
    location: NavigatorLocationType,
    options: SetLocationOptions = {},
  ): ChangeLocationResult {
    this.log('Replacing location:', location);
    const formattedLocation = formatLocation(location);
    this.locationsStack[this.locationIndex] = formattedLocation;

    if (!options.silent) {
      this.emitLocationChanged();
    }

    this.log('Replaced location', formattedLocation);

    return {delta: 0, location: formattedLocation};
  };

  /**
   * Pushes new location to stack and updates current location. Returns
   * navigation change results
   * @param {NavigatorLocationType} location
   * @param options
   */
  pushLocation(
    location: NavigatorLocationType,
    options: SetLocationOptions = {},
  ): ChangeLocationResult {
    this.log('Pushing location:', location);
    const formattedLocation = formatLocation(location);
    const {modifiers, ...rest} = formattedLocation;

    // In case, we met tech location where there are no modifiers, we should
    // throw an error
    if (isTechLocation(location) && modifiers.length === 0) {
      throw new Error('pushLocation received empty location');
    }
    const isReplace = modifiers.includes('replace');

    // If modifier "root" is met, we should check if current location is first
    // in stack and we are in replace mode. Otherwise throw an error
    if (modifiers.includes('root')) {
      this.log('This location has root modifier');

      if (isReplace && this.locationIndex === 0) {
        // Replace location and return result
        return this.replaceLocation({
          ...rest,
          // Remove some forbidden modifiers from list of modifiers
          modifiers: filterStringArray(modifiers, forbiddenRootModifiers),
        }, options);
      }
      this.log('root modifier passed illegally');
      throw new Error(
        '"root" modifier was passed illegally. It should be passed only ' +
        'in case current locationIndex is zero and modifier "replace" is ' +
        'passed too',
      );
    }

    // Replace current location in case "replace" modifier met
    if (isReplace) {
      this.log('This location has "replace" modifier');
      return this.replaceLocation({
        ...rest,
        modifiers: filterStringArray(modifiers, ['replace']),
      }, options);
    }

    // Go back if "back" is passed
    if (modifiers.includes('back')) {
      this.log('This location has "back" modifier');
      return this.back(options);
    }

    // Go forward if "forward" is passed
    if (modifiers.includes('forward')) {
      this.log('This location has "forward" modifier');
      return this.forward(options);
    }

    // All other locations should be just pushed
    this.log('This location has no special modifiers');
    return this.insertLocation(formattedLocation, options);
  };

  /**
   * Goes through stack and reassigns current location. Returns
   * navigation change results
   * @param {number} delta
   * @param {SetLocationOptions} options
   * @returns {ChangeLocationResult}
   */
  go(
    delta: number,
    options: SetLocationOptions = {},
  ): ChangeLocationResult {
    this.log('go() called', delta, options);
    const {locationIndex, locationsStack} = this;
    let nextIndex = locationIndex + delta;

    if (nextIndex < 0) {
      nextIndex = 0;
    } else if (nextIndex >= locationsStack.length) {
      nextIndex = locationsStack.length - 1;
    }

    if (nextIndex === locationIndex) {
      return {delta: 0, location: this.location};
    }

    const direction = delta > 0 ? 'forward' : 'backward';

    // We have a case when nextIndex refers to location which should be
    // slided (has "skip" modifier). So, we have to slide until non-slideable
    // location is found. In case, it cannot be found, we should go the
    // opposite direction from nextIndex
    const location = locationsStack[nextIndex];

    if (location.modifiers.includes('skip')) {
      const testStack = direction === 'forward'
        ? [
          ...locationsStack.slice(nextIndex + 1),
          ...locationsStack
            .slice(locationIndex + 1, nextIndex)
            .reverse(),
        ]
        : [
          ...locationsStack.slice(0, nextIndex).reverse(),
          ...locationsStack.slice(nextIndex + 1, this.locationIndex),
        ];

      const compatibleLocation = testStack.find(l => {
        return !l.modifiers.includes('skip');
      });

      nextIndex = !compatibleLocation
        ? locationIndex
        : locationsStack.indexOf(compatibleLocation);
    }

    if (nextIndex !== locationIndex) {
      this.locationIndex = nextIndex;

      if (!options.silent) {
        this.emitLocationChanged();
      }

      return {delta: nextIndex - locationIndex, location: this.location};
    }

    return {delta: 0, location: this.location};
  }

  /**
   * Shortcut for go(-1)
   * @param {SetLocationOptions} options
   * @returns {ChangeLocationResult}
   */
  back(options: SetLocationOptions = {}): ChangeLocationResult {
    this.log('back() called', options);
    return this.go(-1, options);
  }

  /**
   * Shortcut for go(1)
   * @param {SetLocationOptions} options
   * @returns {ChangeLocationResult}
   */
  forward(options: SetLocationOptions = {}): ChangeLocationResult {
    this.log('forward() called', options);
    return this.go(1, options);
  }

  /**
   * Sets initial values for navigator
   */
  init(
    index: number,
    locationsStack: NavigatorCompleteLocationType[],
  ) {
    if (index < 0 || locationsStack.length <= index) {
      throw new Error(
        'Invalid index was passed. It should be an index in locationsStack',
      );
    }
    const [firstLocation] = locationsStack;
    const hasRootModifier = firstLocation.modifiers.includes('root');

    if (!hasRootModifier) {
      throw new Error(
        'Unable to initialize locations stack where the first location ' +
        'has no "root" modifier. Probably, stack is corrupted',
      );
    }
    const hasForbiddenModifiers = firstLocation.modifiers
      .some(m => forbiddenRootModifiers.includes(m as InternalModifierType));

    if (hasForbiddenModifiers) {
      throw new Error(
        'Unable to initialize locations stack where root location ' +
        'contains forbidden modifiers. Probably, this location was created ' +
        'not by Navigator',
      );
    }
    this.locationIndex = index;
    this.locationsStack = locationsStack;
    this.log('Initialization complete, Arguments:', index, locationsStack);
  }
  
  /**
   * Returns current location
   * @returns {NavigatorCompleteLocationType}
   */
  get location(): NavigatorCompleteLocationType {
    return this.locationsStack[this.locationIndex];
  }

  /**
   * Adds listener for specified event
   * @param {E} event
   * @param {EventListenerFunc<E>} listener
   */
  on = <E extends EventType>(
    event: E,
    listener: EventListenerFunc<E>,
  ) => {
    this.listeners.push({event, listener} as any);
    this.log('Added event listener:', event, listener, this.listeners);
  };

  /**
   * Removes listener from specified event
   * @param {E} event
   * @param {EventListenerFunc<E>} listener
   */
  off = <E extends EventType>(
    event: E,
    listener: EventListenerFunc<E>,
  ) => {
    this.listeners = this.listeners.filter(l => {
      return l.event !== event || l.listener !== listener;
    });
    this.log('Removed event listener:', event, listener, this.listeners);
  };
}
