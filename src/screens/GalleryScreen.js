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
  Modal,
  Dimensions,
  Alert,
  Share,
} from 'react-native';
import { getLocalCaptures, deleteLocalCapture } from '../utils/localGallery';
import { COLORS } from '../constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function GalleryScreen({ navigation }) {
  const [captures, setCaptures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  const loadCaptures = useCallback(async () => {
    try {
      const data = await getLocalCaptures();
      setCaptures(data);
    } catch (e) {
      console.warn('Failed to load local captures:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCaptures();
  }, [loadCaptures]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadCaptures();
  };

  const handleDelete = (item) => {
    Alert.alert(
      'Delete Photo',
      'Are you sure you want to delete this watermarked photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updated = await deleteLocalCapture(item.id);
            setCaptures(updated);
            setSelectedPhoto(null);
          },
        },
      ]
    );
  };

  const handleShare = async (item) => {
    try {
      await Share.share({
        url: item.uri,
        message: `GPS Photo: ${item.address?.city || 'Location'} - ${item.dateTime}`,
      });
    } catch (e) {
      console.warn('Share error:', e);
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.thumbContainer}
      activeOpacity={0.8}
      onPress={() => setSelectedPhoto(item)}
    >
      <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="cover" />
      <View style={styles.thumbBadge}>
        <Text style={styles.thumbBadgeText} numberOfLines={1}>
          {item.address?.city || 'GPS Photo'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backText}>‹ Camera</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Local Gallery ({captures.length})</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Grid */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={captures}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={styles.grid}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.accent}
              colors={[COLORS.accent]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📷</Text>
              <Text style={styles.emptyTitle}>No Photos Saved Yet</Text>
              <Text style={styles.emptySubtitle}>
                Take photos with GPS Map Camera to save watermarked images to your local device memory!
              </Text>
              <TouchableOpacity
                style={styles.takePhotoBtn}
                onPress={() => navigation.navigate('Camera')}
              >
                <Text style={styles.takePhotoBtnText}>Open Camera</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Fullscreen Photo Viewer Modal */}
      {selectedPhoto && (
        <Modal
          visible={Boolean(selectedPhoto)}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedPhoto(null)}
        >
          <View style={styles.modalBackdrop}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSelectedPhoto(null)}
              >
                <Text style={styles.modalCloseText}>✕ Close</Text>
              </TouchableOpacity>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleShare(selectedPhoto)}
                >
                  <Text style={styles.actionBtnText}>Share</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.deleteBtn]}
                  onPress={() => handleDelete(selectedPhoto)}
                >
                  <Text style={[styles.actionBtnText, styles.deleteBtnText]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Photo */}
            <View style={styles.modalImageContainer}>
              <Image
                source={{ uri: selectedPhoto.uri }}
                style={styles.fullscreenImage}
                resizeMode="contain"
              />
            </View>

            {/* Metadata Bottom Bar */}
            <View style={styles.modalFooter}>
              <Text style={styles.modalTitle}>
                {selectedPhoto.address?.city || 'Location'}
                {selectedPhoto.address?.region ? `, ${selectedPhoto.address.region}` : ''}
              </Text>
              {selectedPhoto.coords && (
                <Text style={styles.modalCoords}>
                  Lat {selectedPhoto.coords.latitude?.toFixed(6)}°, Long{' '}
                  {selectedPhoto.coords.longitude?.toFixed(6)}°
                </Text>
              )}
              {selectedPhoto.address?.street ? (
                <Text style={styles.modalStreet}>{selectedPhoto.address.street}</Text>
              ) : null}
              <Text style={styles.modalDate}>{selectedPhoto.dateTime}</Text>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1f',
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#1f242e',
    borderRadius: 8,
  },
  backText: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  grid: {
    padding: 2,
  },
  thumbContainer: {
    width: '33.33%',
    aspectRatio: 1,
    padding: 2,
    position: 'relative',
  },
  thumb: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#161922',
  },
  thumbBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
  },
  thumbBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  emptyContainer: {
    marginTop: 100,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 50,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  takePhotoBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  takePhotoBtnText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
    justifyContent: 'space-between',
  },
  modalHeader: {
    paddingTop: 50,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  modalCloseBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
  },
  modalCloseText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
  },
  actionBtn: {
    marginLeft: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  deleteBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
  },
  deleteBtnText: {
    color: '#ef4444',
  },
  modalImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.65,
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalCoords: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  modalStreet: {
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 2,
  },
  modalDate: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
});
