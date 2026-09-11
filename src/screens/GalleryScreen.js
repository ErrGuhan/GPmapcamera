import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  FlatList,
  Image,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library/legacy';
import { supabase } from '../lib/supabase';
import { getSignedUrl } from '../utils/upload';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/theme';

const TAB = { DEVICE: 'device', CLOUD: 'cloud' };

export default function GalleryScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState(TAB.DEVICE);

  // ---------------------------------------------------------------------------
  // On Device tab state
  // ---------------------------------------------------------------------------
  const [deviceAssets, setDeviceAssets] = useState([]);
  const [deviceLoading, setDeviceLoading] = useState(false);

  const loadDeviceAssets = useCallback(async () => {
    setDeviceLoading(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      if (status !== 'granted') return;
      const album = await MediaLibrary.getAssetsAsync({
        first: 100,
        mediaType: [MediaLibrary.MediaType.photo],
        sortBy: [MediaLibrary.SortBy.creationTime],
      });
      setDeviceAssets(album?.assets || []);
    } catch (e) {
      console.warn('Failed to load device assets:', e);
    } finally {
      setDeviceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === TAB.DEVICE) loadDeviceAssets();
  }, [activeTab, loadDeviceAssets]);

  // ---------------------------------------------------------------------------
  // Cloud tab state
  // ---------------------------------------------------------------------------
  const [cloudCaptures, setCloudCaptures] = useState([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadCloudCaptures = useCallback(async () => {
    if (!user?.id) return;
    setCloudError(null);
    setCloudLoading(true);
    try {
      // Fetch rows for this user, newest first
      const { data, error } = await supabase
        .from('captures')
        .select('id, storage_path, address_city, address_region, captured_at, media_type')
        .eq('user_id', user.id)
        .order('captured_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Generate signed URLs in parallel (1-hour expiry)
      const withUrls = await Promise.all(
        (data || []).map(async (row) => {
          const signedUrl = await getSignedUrl(row.storage_path);
          return { ...row, signedUrl };
        })
      );

      setCloudCaptures(withUrls);
    } catch (e) {
      console.warn('[GalleryScreen] Cloud load failed:', e.message);
      setCloudError('Could not load cloud photos. Check your connection.');
    } finally {
      setCloudLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (activeTab === TAB.CLOUD) loadCloudCaptures();
  }, [activeTab, loadCloudCaptures]);

  function handleRefresh() {
    setRefreshing(true);
    loadCloudCaptures();
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  function renderDeviceThumb({ item }) {
    return <Image source={{ uri: item.uri }} style={styles.thumb} />;
  }

  function renderCloudThumb({ item }) {
    return (
      <View style={styles.thumbContainer}>
        {item.signedUrl ? (
          <Image
            source={{ uri: item.signedUrl }}
            style={styles.thumb}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Text style={styles.thumbPlaceholderText}>?</Text>
          </View>
        )}
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Gallery</Text>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Tab toggle */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === TAB.DEVICE && styles.tabBtnActive]}
          onPress={() => setActiveTab(TAB.DEVICE)}
        >
          <Text style={[styles.tabText, activeTab === TAB.DEVICE && styles.tabTextActive]}>
            On Device
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === TAB.CLOUD && styles.tabBtnActive]}
          onPress={() => setActiveTab(TAB.CLOUD)}
        >
          <Text style={[styles.tabText, activeTab === TAB.CLOUD && styles.tabTextActive]}>
            ☁ Cloud
          </Text>
        </TouchableOpacity>
      </View>

      {/* On Device tab */}
      {activeTab === TAB.DEVICE && (
        deviceLoading ? (
          <LoadingView />
        ) : (
          <FlatList
            data={deviceAssets}
            keyExtractor={(item) => item.id}
            numColumns={3}
            contentContainerStyle={styles.grid}
            renderItem={renderDeviceThumb}
            ListEmptyComponent={
              <EmptyView message="No photos yet. Take one from the camera screen!" />
            }
          />
        )
      )}

      {/* Cloud tab */}
      {activeTab === TAB.CLOUD && (
        cloudLoading && !refreshing ? (
          <LoadingView />
        ) : cloudError ? (
          <View style={styles.centerContent}>
            <Text style={styles.errorText}>{cloudError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadCloudCaptures}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={cloudCaptures}
            keyExtractor={(item) => item.id}
            numColumns={3}
            contentContainerStyle={styles.grid}
            renderItem={renderCloudThumb}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={COLORS.accent}
                colors={[COLORS.accent]}
              />
            }
            ListEmptyComponent={
              <EmptyView message="No cloud captures yet. Take a photo to back it up!" />
            }
          />
        )
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function LoadingView() {
  return (
    <View style={styles.centerContent}>
      <ActivityIndicator color={COLORS.accent} size="large" />
    </View>
  );
}

function EmptyView({ message }) {
  return (
    <Text style={styles.emptyText}>{message}</Text>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backText: { color: '#fff', fontSize: 16 },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  signOutText: { color: '#888', fontSize: 14 },

  // Tab toggle
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabBtnActive: { backgroundColor: COLORS.accent },
  tabText: { color: '#888', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#000' },

  // Grid
  grid: { padding: 2 },
  thumb: { width: '33.3%', aspectRatio: 1, margin: 0.5 },
  thumbContainer: { width: '33.3%', aspectRatio: 1, margin: 0.5 },
  thumbPlaceholder: {
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbPlaceholderText: { color: '#555', fontSize: 22 },

  // States
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    color: '#888',
    textAlign: 'center',
    marginTop: 60,
    paddingHorizontal: 32,
    lineHeight: 22,
  },
  errorText: {
    color: '#ff6b6b',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  retryBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: { color: '#000', fontWeight: 'bold' },
});
