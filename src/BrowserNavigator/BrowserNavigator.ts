import {Navigator} from '../Navigator';
import {
  EventListenerFunc,
  EventType,
  NavigatorLocationType,
  INavigator,
  SetLocationOptions,
} from '../types';
import {
  parseSegue,
  createSegue, createLogger,
} from '../utils';
import {
  BrowserHistoryState,
  BrowserNavigatorConstructorProps,
  BrowserNavigatorModeType,
} from './types';
import {isBrowserState} from './utils';

export class BrowserNavigator implements INavigator {
  private readonly mode: BrowserNavigatorModeType;
  private readonly navigator: Navigator;
  private lastPopstateSegue: string | null = null;
  private originalPushState = window.history.pushState.bind(window.history);
  private originalReplaceState = window.history.replaceState
    .bind(window.history);

  /**
   * Logs message into console
   */
  private readonly log: (...messages: any[]) => void;

  constructor(props: BrowserNavigatorConstructorProps = {}) {
    const {mode = 'hash', log = false} = props;

    this.navigator = new Navigator(props);
    this.mode = mode;
    this.log = log ? createLogger('BrowserNavigator') : () => {
    };
    this.log('Instance created');
  }

  /**
   * Event listener which watches for popstate event and calls Navigator
   * location update
   */
  private onPopState = (e: PopStateEvent) => {
    const prevSegue = this.lastPopstateSegue;
    const segue = this.mode === 'default'
      ? window.location.pathname
      : window.location.hash;

    this.lastPopstateSegue = segue;

    // Skip the same locations. This problem occurs when user clicks
    // one link several times. History does not change but event is triggered
    if (prevSegue === segue) {
      // TODO: Should we call pushState? User could click the same segue
      //  several times and it is correct, but nothing will happen
      //  browser's history and navigator too. Not sure our current solution
      //  is correct
      return;
    }

    if (isBrowserState(e.state)) {
      // When popstate event is called, it means, browser create history move.
      // So, we have to detect which direction user chose and how far he
      // went
      const delta = e.state.navigator.locationIndex -
        this.navigator.locationIndex;

      // Synchronize user move with navigator
      const {delta: navigatorDelta} = this.navigator.go(delta);
      const additionalDelta = navigatorDelta - delta;

      if (additionalDelta !== 0) {
        this.go(additionalDelta);
      }
    } else {
      const location = parseSegue(segue);

      // In case, location cannot be extracted, prevent routing and throw error
      if (location === null) {
        window.history.back();
        throw new Error('Unable to extract location from popstate event');
      }
      this.navigator.pushLocation(location);
      this.originalReplaceState(
        this.createHistoryState(e.state),
        '',
        this.createSegue(location),
      );
    }
  };

  /**
   * Creates state for browser's history
   * @param data
   * @returns {BrowserHistoryState}
   */
  private createHistoryState(data: any = null): BrowserHistoryState {
    return {
      state: data,
      navigator: {
        locationIndex: this.navigator.locationIndex,
        locationsStack: this.navigator.locationsStack,
      },
    };
  }

  /**
   * Prepares location and uses original window's pushState method
   * @param {NavigatorLocationType} location
   * @param data
   * @param {SetLocationOptions} options
   */
  private pushState(
    location: NavigatorLocationType,
    options: SetLocationOptions = {},
    data: any = null,
  ) {
    const {
      location: parsedLocation, delta,
    } = this.navigator.pushLocation(location, options);

    // In case, location push was successful, we can original pushState
    if (delta > 0) {
      this.originalPushState(
        this.createHistoryState(data),
        '',
        this.createSegue(parsedLocation),
      );
    }
    // Otherwise, if we returned in history, just call "go" 
    else if (delta < 0) {
      window.history.go(delta);
    }
  }

  /**
   * Prepares location and uses original window's replaceState method
   * @param {NavigatorLocationType} location
   * @param {SetLocationOptions} options
   * @param data
   */
  private replaceState(
    location: NavigatorLocationType,
    options: SetLocationOptions = {},
    data: any = null,
  ) {
    const {modifiers, ...rest} = location;
    this.navigator.pushLocation({
      modifiers: [...(modifiers || []), 'replace'],
      ...rest,
    }, options);
    this.originalReplaceState(
      this.createHistoryState(data),
      '',
      this.createSegue(location),
    );
  }

  get location() {
    return this.navigator.location;
  }

  get history() {
    return this.navigator.locationsStack;
  }

  pushLocation(
    location: NavigatorLocationType,
    options: SetLocationOptions = {},
  ) {
    this.pushState(location, options);
  }

  replaceLocation(
    location: NavigatorLocationType,
    options: SetLocationOptions = {},
  ) {
    this.replaceState(location, options);
  }

  mount() {
    // Override pushState and fulfill with navigators data
    window.history.pushState = (
      data: any,
      title: string,
      url?: string | null,
    ) => {
      const parsedLocation = parseSegue(url || '');

      if (parsedLocation === null) {
        throw new Error(
          'Unable to extract location from passed url to pushState',
        );
      }
      this.pushState(parsedLocation);
    };

    // Override replaceState and fulfill with navigators data
    window.history.replaceState = (
      data: any,
      title: string,
      url?: string | null,
    ) => {
      const parsedLocation = parseSegue(url || '');

      if (parsedLocation === null) {
        throw new Error(
          'Unable to extract location from passed url to replaceState',
        );
      }
      this.replaceState(parsedLocation);
    };

    // Add event listener watching for history changes
    window.addEventListener('popstate', this.onPopState);

    // Derive initial state from current browser state
    if (isBrowserState(window.history.state)) {
      this.log(
        'Detected initial state while mounting:',
        window.history.state.navigator,
      );
      const {locationIndex, locationsStack} = window.history.state.navigator;
      this.navigator.init(locationIndex, locationsStack);
    }
    // In case, history length is 1, it means, we are currently on the first
    // its item. So then, we should replace current state with new one
    // compatible to navigator
    else if (window.history.length === 1) {
      this.log('Detected empty history. Replaced with root location');
      this.replaceState({modifiers: ['root']}, {silent: true});
    }

    this.log(
      'Mount completed. Stack:', this.navigator.locationsStack,
      'Location:', this.location,
    );
  }

  unmount() {
    window.removeEventListener('popstate', this.onPopState);
    window.history.pushState = this.originalPushState;
    window.history.replaceState = this.originalReplaceState;
  }

  // FIXME: Not working
  back = window.history.back.bind(window.history);

  // FIXME: Not working
  forward = window.history.forward.bind(window.history);

  // FIXME: Not working
  go = window.history.go.bind(window.history);

  on<E extends EventType>(
    event: E,
    listener: EventListenerFunc<E>,
  ) {
    this.navigator.on(event, listener);
  };

  off<E extends EventType>(
    event: E,
    listener: EventListenerFunc<E>,
  ) {
    this.navigator.off(event, listener);
  };

  createSegue(location: NavigatorLocationType): string {
    return (this.mode === 'default' ? '' : '#') + createSegue(location);
  }
}
