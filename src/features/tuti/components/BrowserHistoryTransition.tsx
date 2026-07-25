"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

type ExitHandler = {
  destinationPath: string;
  run: () => Promise<void>;
};

type BrowserNavigationEntry = {
  index: number;
};

type BrowserNavigationDestination = {
  index: number;
  url: string;
};

type BrowserNavigateEvent = Event & {
  canIntercept: boolean;
  destination: BrowserNavigationDestination;
  navigationType: "push" | "reload" | "replace" | "traverse";
  intercept: (options: {
    precommitHandler: () => Promise<void>;
  }) => void;
};

type BrowserNavigation = EventTarget & {
  currentEntry: BrowserNavigationEntry | null;
};

type RegisterExitHandler = (
  sourcePath: string,
  handler: ExitHandler,
) => () => void;

const BrowserHistoryTransitionContext =
  createContext<RegisterExitHandler>(() => () => undefined);

export function BrowserHistoryTransitionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const exitHandlers = useRef(new Map<string, ExitHandler>());

  const registerExitHandler = useCallback<RegisterExitHandler>(
    (sourcePath, handler) => {
      exitHandlers.current.set(sourcePath, handler);

      return () => {
        if (exitHandlers.current.get(sourcePath) === handler) {
          exitHandlers.current.delete(sourcePath);
        }
      };
    },
    [],
  );

  useEffect(() => {
    const navigation = getBrowserNavigation();

    if (!navigation) return;

    const interceptHistoryTraversal = (rawEvent: Event) => {
      const event = rawEvent as BrowserNavigateEvent;
      const currentIndex = navigation.currentEntry?.index;

      if (
        event.navigationType !== "traverse" ||
        !event.canIntercept ||
        currentIndex === undefined ||
        event.destination.index >= currentIndex
      ) {
        return;
      }

      const sourceUrl = new URL(window.location.href);
      const destinationUrl = new URL(event.destination.url);
      const exitHandler = exitHandlers.current.get(sourceUrl.pathname);

      if (
        destinationUrl.origin !== sourceUrl.origin ||
        !exitHandler ||
        exitHandler.destinationPath !== destinationUrl.pathname
      ) {
        return;
      }

      try {
        event.intercept({
          precommitHandler: exitHandler.run,
        });
      } catch {
        // If the browser or another router cannot be intercepted,
        // leave the native history traversal untouched.
      }
    };

    navigation.addEventListener(
      "navigate",
      interceptHistoryTraversal as EventListener,
    );

    return () => {
      navigation.removeEventListener(
        "navigate",
        interceptHistoryTraversal as EventListener,
      );
    };
  }, []);

  return (
    <BrowserHistoryTransitionContext.Provider
      value={registerExitHandler}
    >
      {children}
    </BrowserHistoryTransitionContext.Provider>
  );
}

export function useBrowserHistoryExit({
  sourcePath,
  destinationPath,
  onExit,
}: {
  sourcePath: string;
  destinationPath: string;
  onExit: () => Promise<void>;
}) {
  const registerExitHandler = useContext(
    BrowserHistoryTransitionContext,
  );
  const latestExit = useRef(onExit);

  useLayoutEffect(() => {
    latestExit.current = onExit;
  }, [onExit]);

  const handler = useMemo<ExitHandler>(
    () => ({
      destinationPath,
      run: () => latestExit.current(),
    }),
    [destinationPath],
  );

  useEffect(
    () => registerExitHandler(sourcePath, handler),
    [handler, registerExitHandler, sourcePath],
  );
}

function getBrowserNavigation() {
  if (typeof window === "undefined") return undefined;

  return (
    window as typeof window & {
      navigation?: BrowserNavigation;
    }
  ).navigation;
}
