'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';

type UseFullscreenOptions = {
  enableHotkeys?: boolean;
};

const isEditableTarget = (target: EventTarget | null) => {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable;
};

export const useFullscreen = <T extends HTMLElement>(
  targetRef: RefObject<T>,
  options: UseFullscreenOptions = {}
) => {
  const { enableHotkeys = false } = options;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateFullscreenState = useCallback(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const activeElement = document.fullscreenElement;
    const target = targetRef.current;
    setIsFullscreen(target ? activeElement === target : Boolean(activeElement));
  }, [targetRef]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const enabled = document.fullscreenEnabled ?? true;
    const canRequest = typeof document.documentElement?.requestFullscreen === 'function';
    setIsSupported(Boolean(enabled && canRequest));
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    updateFullscreenState();
    document.addEventListener('fullscreenchange', updateFullscreenState);
    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenState);
    };
  }, [updateFullscreenState]);

  const enterFullscreen = useCallback(async () => {
    setError(null);
    if (typeof document === 'undefined') {
      return false;
    }
    const target = targetRef.current;
    if (!target || typeof target.requestFullscreen !== 'function') {
      setError('Fullscreen is unavailable.');
      return false;
    }
    try {
      await target.requestFullscreen();
      return true;
    } catch {
      setError('Unable to enter full screen.');
      return false;
    }
  }, [targetRef]);

  const exitFullscreen = useCallback(async () => {
    setError(null);
    if (typeof document === 'undefined') {
      return false;
    }
    if (!document.fullscreenElement) {
      return true;
    }
    try {
      await document.exitFullscreen();
      return true;
    } catch {
      setError('Unable to exit full screen.');
      return false;
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      void exitFullscreen();
    } else {
      void enterFullscreen();
    }
  }, [enterFullscreen, exitFullscreen, isFullscreen]);

  useEffect(() => {
    if (!enableHotkeys || typeof document === 'undefined') {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (event.key.toLowerCase() !== 'f') {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      toggleFullscreen();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enableHotkeys, toggleFullscreen]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isFullscreen,
    isSupported,
    error,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
    clearError,
  };
};
