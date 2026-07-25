"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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

type BrowserHistoryTransitionContextValue = {
  completeHistoryEntry: (destinationPath: string) => void;
  historyEntryPath: string | null;
  registerExitHandler: RegisterExitHandler;
  revealDestination: (destinationPath: string) => void;
};

const BrowserHistoryTransitionContext =
  createContext<BrowserHistoryTransitionContextValue>({
    completeHistoryEntry: () => undefined,
    historyEntryPath: null,
    registerExitHandler: () => () => undefined,
    revealDestination: () => undefined,
  });

export function BrowserHistoryTransitionProvider({
  children,
  onDestinationReveal,
}: {
  children: ReactNode;
  onDestinationReveal?: (destinationPath: string) => void;
}) {
  const exitHandlers = useRef(new Map<string, ExitHandler>());
  const historyEntryResetTimer = useRef<number | null>(null);
  const [historyEntryPath, setHistoryEntryPath] = useState<string | null>(
    null,
  );

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
  const revealDestination = useCallback(
    (destinationPath: string) => {
      onDestinationReveal?.(destinationPath);
    },
    [onDestinationReveal],
  );
  const beginHistoryEntry = useCallback((destinationPath: string) => {
    setHistoryEntryPath(destinationPath);

    if (historyEntryResetTimer.current) {
      window.clearTimeout(historyEntryResetTimer.current);
    }

    historyEntryResetTimer.current = window.setTimeout(() => {
      setHistoryEntryPath(null);
      historyEntryResetTimer.current = null;
    }, 1200);
  }, []);
  const completeHistoryEntry = useCallback(
    (destinationPath: string) => {
      setHistoryEntryPath((currentPath) =>
        currentPath === destinationPath ? null : currentPath,
      );

      if (historyEntryResetTimer.current) {
        window.clearTimeout(historyEntryResetTimer.current);
        historyEntryResetTimer.current = null;
      }
    },
    [],
  );
  const contextValue = useMemo<BrowserHistoryTransitionContextValue>(
    () => ({
      completeHistoryEntry,
      historyEntryPath,
      registerExitHandler,
      revealDestination,
    }),
    [
      completeHistoryEntry,
      historyEntryPath,
      registerExitHandler,
      revealDestination,
    ],
  );

  useEffect(() => {
    const navigation = getBrowserNavigation();

    if (!navigation) return;

    const interceptHistoryTraversal = (rawEvent: Event) => {
      const event = rawEvent as BrowserNavigateEvent;
      const currentIndex = navigation.currentEntry?.index;

      if (
        event.navigationType !== "traverse" ||
        currentIndex === undefined
      ) {
        return;
      }

      const sourceUrl = new URL(window.location.href);
      const destinationUrl = new URL(event.destination.url);

      if (destinationUrl.origin !== sourceUrl.origin) return;

      if (event.destination.index > currentIndex) {
        if (
          sourceUrl.pathname === "/" &&
          destinationUrl.pathname === "/journal"
        ) {
          beginHistoryEntry(destinationUrl.pathname);
        }

        return;
      }

      if (
        !event.canIntercept ||
        event.destination.index === currentIndex
      ) {
        return;
      }

      const exitHandler = exitHandlers.current.get(sourceUrl.pathname);

      if (
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
  }, [beginHistoryEntry]);

  useEffect(
    () => () => {
      if (historyEntryResetTimer.current) {
        window.clearTimeout(historyEntryResetTimer.current);
      }
    },
    [],
  );

  return (
    <BrowserHistoryTransitionContext.Provider
      value={contextValue}
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
  const { registerExitHandler } = useContext(
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

export function useHistoryDestinationReveal(destinationPath: string) {
  const { revealDestination } = useContext(
    BrowserHistoryTransitionContext,
  );

  return useCallback(
    () => revealDestination(destinationPath),
    [destinationPath, revealDestination],
  );
}

export function useBrowserHistoryEntry(destinationPath: string) {
  const { completeHistoryEntry, historyEntryPath } = useContext(
    BrowserHistoryTransitionContext,
  );

  return {
    completeEntry: useCallback(
      () => completeHistoryEntry(destinationPath),
      [completeHistoryEntry, destinationPath],
    ),
    isEntering: historyEntryPath === destinationPath,
  };
}

function getBrowserNavigation() {
  if (typeof window === "undefined") return undefined;

  return (
    window as typeof window & {
      navigation?: BrowserNavigation;
    }
  ).navigation;
}
