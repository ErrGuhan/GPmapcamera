import React, { useEffect, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { retryPendingUploads } from '../utils/upload';
import { useAuth } from '../context/AuthContext';

/**
 * Custom hook that watches network connectivity and automatically retries
 * pending uploads whenever the device goes online.
 *
 * Usage: call once at the top of App.js (inside AuthProvider) or in a
 * screen that is always mounted when the user is authenticated.
 */
export function useUploadQueue() {
  const { user } = useAuth();

  const retry = useCallback(async () => {
    if (!user?.id) return;
    const result = await retryPendingUploads(user.id);
    if (result.succeeded > 0 || result.failed > 0) {
      console.log(
        `[useUploadQueue] Queue processed — succeeded: ${result.succeeded}, failed: ${result.failed}`
      );
    }
  }, [user?.id]);

  // Retry once on mount (catches items queued in a previous session)
  useEffect(() => {
    retry();
  }, [retry]);

  // Retry whenever connectivity is restored
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable) {
        retry();
      }
    });
    return unsubscribe;
  }, [retry]);
}
