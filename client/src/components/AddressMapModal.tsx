// src/components/AddressMapModal.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import {
  Ionicons,
  MaterialCommunityIcons,
  Feather,
} from "@expo/vector-icons";
import * as Location from "expo-location";

const { width, height } = Dimensions.get("window");

// Safe Dynamic Resolution for WebView to prevent Invariant Violation / RNCWebViewModule crashes
let NativeWebViewComponent: any = null;
try {
  const RNWebViewModule = require("react-native-webview");
  NativeWebViewComponent = RNWebViewModule.WebView || RNWebViewModule.default || null;
} catch (e) {
  NativeWebViewComponent = null;
}

const SafeMapWebView = React.forwardRef<any, any>((props, ref) => {
  if (NativeWebViewComponent) {
    return <NativeWebViewComponent ref={ref} {...props} />;
  }

  return (
    <View style={[StyleSheet.absoluteFillObject, styles.mapFallbackContainer]}>
      <Ionicons name="map-outline" size={48} color="#15803D" style={{ marginBottom: 8 }} />
      <Text style={styles.mapFallbackTitle}>Interactive Map View</Text>
      <Text style={styles.mapFallbackSubtitle}>
        Drag pin or search to set your location coordinates
      </Text>
    </View>
  );
});

interface SearchSuggestion {
  place_id: string;
  display_name: string;
  lat: string;
  lon: string;
}

export interface AddressMapConfirmPayload {
  coords: { latitude: number; longitude: number };
  pinnedAddress: string;
  houseDetail: string;
  customTagTitle: string;
  addressTag: "Home" | "Work" | "Other";
}

interface AddressMapModalProps {
  visible: boolean;
  editing: boolean;
  initialCoords: { latitude: number; longitude: number };
  initialPinnedAddress: string;
  initialHouseDetail: string;
  initialCustomTagTitle: string;
  initialAddressTag: "Home" | "Work" | "Other";
  onClose: () => void;
  onConfirm: (payload: AddressMapConfirmPayload) => void;
}

export default function AddressMapModal({
  visible,
  editing,
  initialCoords,
  initialPinnedAddress,
  initialHouseDetail,
  initialCustomTagTitle,
  initialAddressTag,
  onClose,
  onConfirm,
}: AddressMapModalProps) {
  const [mapCoords, setMapCoords] = useState(initialCoords);
  const mapCoordsRef = useRef(initialCoords);
  const [pinnedAddress, setPinnedAddress] = useState(
    initialPinnedAddress || "Locating address..."
  );
  const [houseDetail, setHouseDetail] = useState(initialHouseDetail);
  const [customTagTitle, setCustomTagTitle] = useState(initialCustomTagTitle);
  const [addressTag, setAddressTag] = useState<"Home" | "Work" | "Other">(initialAddressTag);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [isMapMoving, setIsMapMoving] = useState(false);

  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [isSearchingMap, setIsSearchingMap] = useState(false);

  const searchCacheRef = useRef<{ [key: string]: SearchSuggestion[] }>({});
  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const webViewRef = useRef<any>(null);
  const searchTimeoutRef = useRef<any>(null);
  const geocodeTimeoutRef = useRef<any>(null);

  // Sync local state whenever the modal opens
  useEffect(() => {
    if (visible) {
      setMapCoords(initialCoords);
      mapCoordsRef.current = initialCoords;
      setPinnedAddress(initialPinnedAddress || "Locating address...");
      setHouseDetail(initialHouseDetail);
      setCustomTagTitle(initialCustomTagTitle);
      setAddressTag(initialAddressTag);
      setMapSearchQuery("");
      setSearchResults([]);
      setIsSearchingMap(false);
      setIsMapMoving(false);
      setIsReverseGeocoding(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (geocodeTimeoutRef.current) clearTimeout(geocodeTimeoutRef.current);
      if (searchAbortControllerRef.current) {
        try {
          searchAbortControllerRef.current.abort();
        } catch {}
      }
    };
  }, []);

  const handleMapMoved = (lat: number, lng: number) => {
    setIsMapMoving(false);
    mapCoordsRef.current = { latitude: lat, longitude: lng };
    setIsReverseGeocoding(true);

    if (geocodeTimeoutRef.current) {
      clearTimeout(geocodeTimeoutRef.current);
    }

    geocodeTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (results && results.length > 0) {
          const item = results[0];
          const road = item.street || item.name || item.district || item.subregion || "";
          const cityArea = item.city || item.subregion || item.region || "";
          const formatted = [road, cityArea].filter(Boolean).join(", ") || "Selected Location";
          setPinnedAddress(formatted);
        } else {
          setPinnedAddress(`Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
        }
      } catch (err) {
        setPinnedAddress(`Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
      } finally {
        setIsReverseGeocoding(false);
      }
    }, 350);
  };

  const handleSearchAddressChange = (text: string) => {
    setMapSearchQuery(text);
    const cleanText = text.trim();

    if (!cleanText) {
      setSearchResults([]);
      setIsSearchingMap(false);
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
      }
      return;
    }

    const cacheKey = cleanText.toLowerCase();
    if (searchCacheRef.current[cacheKey]) {
      setSearchResults(searchCacheRef.current[cacheKey]);
      setIsSearchingMap(false);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
      }

      const controller = new AbortController();
      searchAbortControllerRef.current = controller;
      setIsSearchingMap(true);

      try {
        const queryWithState = `${cleanText}, Telangana`;
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            queryWithState
          )}&format=json&countrycodes=in&viewbox=77.2,19.9,81.8,15.8&bounded=1&limit=5&addressdetails=0`,
          {
            signal: controller.signal,
            headers: {
              "User-Agent": "FoodDeliverySpeedEngine/2.0",
            },
          }
        );
        const data = await res.json();
        const results = data || [];
        searchCacheRef.current[cacheKey] = results;
        setSearchResults(results);
      } catch (e: any) {
        if (e.name !== "AbortError") {
          setSearchResults([]);
        }
      } finally {
        setIsSearchingMap(false);
      }
    }, 180);
  };

  const handleSelectSearchResult = (item: SearchSuggestion) => {
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);

    mapCoordsRef.current = { latitude: lat, longitude: lon };
    setPinnedAddress(item.display_name);
    setSearchResults([]);
    setMapSearchQuery("");

    if (webViewRef.current && webViewRef.current.injectJavaScript) {
      webViewRef.current.injectJavaScript(`
        if (window.map) {
          window.map.panTo([${lat}, ${lon}], { animate: true, duration: 0.8 });
        }
        true;
      `);
    }
  };

  const handleRecenterToGPS = async () => {
    try {
      setIsReverseGeocoding(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Please grant location permission to detect GPS.");
        setIsReverseGeocoding(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = loc.coords.latitude;
      const lon = loc.coords.longitude;

      mapCoordsRef.current = { latitude: lat, longitude: lon };

      if (webViewRef.current && webViewRef.current.injectJavaScript) {
        webViewRef.current.injectJavaScript(`
          if (window.map) {
            window.map.panTo([${lat}, ${lon}], { animate: true, duration: 0.8 });
          }
          true;
        `);
      }
      handleMapMoved(lat, lon);
    } catch (e) {
      setIsReverseGeocoding(false);
    }
  };

  const handleConfirmPress = () => {
    if (pinnedAddress && pinnedAddress !== "Locating address...") {
      onConfirm({
        coords: mapCoordsRef.current,
        pinnedAddress,
        houseDetail: houseDetail.trim(),
        customTagTitle: customTagTitle.trim(),
        addressTag,
      });
    } else {
      onClose();
    }
  };

  const detailedMapHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          * { -webkit-tap-highlight-color: transparent; outline: none; }
          html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; background-color: #F8FAFC; }
          .leaflet-control-attribution { display: none !important; }
          .leaflet-container { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          
          .custom-zoom-panel {
            position: absolute;
            right: 14px;
            top: 14px;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .glass-zoom-btn {
            width: 36px;
            height: 36px;
            background: rgba(255, 255, 255, 0.92);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border-radius: 12px;
            border: 1px solid rgba(226, 232, 240, 0.8);
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
            color: #1E293B;
            font-size: 19px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            user-select: none;
            transition: all 0.15s ease;
          }
          .glass-zoom-btn:active {
            transform: scale(0.92);
            background: #F1F5F9;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <div class="custom-zoom-panel">
          <div class="glass-zoom-btn" onclick="map.zoomIn()">+</div>
          <div class="glass-zoom-btn" onclick="map.zoomOut()">−</div>
        </div>
        <script>
          var map = L.map('map', {
            center: [${mapCoords.latitude}, ${mapCoords.longitude}],
            zoom: 16,
            zoomControl: false,
            zoomAnimation: true,
            fadeAnimation: true,
            markerZoomAnimation: true
          });

          L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 20,
            minZoom: 10,
            subdomains: 'abcd'
          }).addTo(map);

          map.on('movestart', function() {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MOVE_START' }));
            }
          });

          map.on('moveend', function() {
            var center = map.getCenter();
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'MOVE_END',
                lat: center.lat,
                lng: center.lng
              }));
            }
          });
        </script>
      </body>
    </html>
  `;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.realMapModalRoot}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

        <View style={styles.realMapTopHeader}>
          <View style={styles.realMapHeaderRow}>
            <TouchableOpacity
              style={styles.realMapBackBtn}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-back" size={22} color="#0F172A" />
            </TouchableOpacity>

            <View style={styles.realMapSearchInputWrapper}>
              <Feather name="search" size={16} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.realMapSearchInput}
                placeholder="Search street, area in Telangana..."
                placeholderTextColor="#94A3B8"
                value={mapSearchQuery}
                onChangeText={handleSearchAddressChange}
              />
              {isSearchingMap && (
                <ActivityIndicator size="small" color="#15803D" style={{ marginRight: 6 }} />
              )}
              {mapSearchQuery.length > 0 && !isSearchingMap && (
                <TouchableOpacity onPress={() => handleSearchAddressChange("")}>
                  <Ionicons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {searchResults.length > 0 && (
            <View style={styles.searchResultsDropdown}>
              {searchResults.map((item: SearchSuggestion) => (
                <TouchableOpacity
                  key={item.place_id}
                  style={styles.searchResultItemRow}
                  activeOpacity={0.8}
                  onPress={() => handleSelectSearchResult(item)}
                >
                  <Ionicons name="location-outline" size={18} color="#15803D" style={{ marginRight: 10 }} />
                  <Text style={styles.searchResultItemText} numberOfLines={2}>
                    {item.display_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.halfScreenMapContainer}>
          <SafeMapWebView
            ref={webViewRef}
            source={{ html: detailedMapHTML }}
            style={StyleSheet.absoluteFillObject}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            onMessage={(event: any) => {
              try {
                const data = JSON.parse(event.nativeEvent.data);
                if (data.type === "MOVE_START") {
                  setIsMapMoving(true);
                  setIsReverseGeocoding(true);
                } else if (data.type === "MOVE_END" && data.lat && data.lng) {
                  handleMapMoved(data.lat, data.lng);
                }
              } catch (e) {
                // Fallback
              }
            }}
          />

          <View style={styles.centerFixedPinOverlay} pointerEvents="none">
            <View style={[styles.pinTooltipBubble, isMapMoving && styles.pinTooltipBubbleActive]}>
              <View style={styles.pinDotIndicator} />
              <Text style={styles.pinTooltipBubbleText}>
                {isReverseGeocoding ? "Locating address..." : "Delivering here"}
              </Text>
            </View>
            <View style={[styles.pinIconWrapper, isMapMoving && styles.pinIconWrapperElevated]}>
              <Ionicons name="location-sharp" size={34} color="#15803D" />
              <View style={styles.pinCenterCoreDot} />
            </View>
            <View style={[styles.pinRadarRing, isMapMoving && styles.pinRadarRingActive]} />
            <View style={styles.pinGroundShadowDot} />
          </View>

          <TouchableOpacity
            style={styles.mapGpsRecenterBtn}
            activeOpacity={0.85}
            onPress={handleRecenterToGPS}
          >
            <Ionicons name="locate" size={21} color="#15803D" />
          </TouchableOpacity>
        </View>

        <View style={styles.bottomLocationCard}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.bottomSheetScrollContent}
          >
            <View style={styles.pinnedAddressSummaryRow}>
              <View style={styles.pinnedAddressIconBox}>
                <Ionicons name="location" size={22} color="#15803D" />
              </View>

              <View style={styles.pinnedAddressDetailsCol}>
                <View style={styles.pinnedAddressHeaderFlex}>
                  <Text style={styles.pinnedAddressLabel}>
                    {editing ? "Edit Selected Location" : "Selected Delivery Area"}
                  </Text>
                  {isReverseGeocoding && (
                    <ActivityIndicator size="small" color="#15803D" style={{ marginLeft: 8 }} />
                  )}
                </View>
                <Text style={styles.pinnedAddressFullString} numberOfLines={2}>
                  {pinnedAddress}
                </Text>
              </View>
            </View>

            <View style={styles.doorNumberSection}>
              <Text style={styles.inputFieldTitle}>HOUSE / FLAT / BLOCK NO. & LANDMARK</Text>
              <View style={styles.doorNumberInputWrapper}>
                <MaterialCommunityIcons name="home-city-outline" size={18} color="#64748B" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.doorNumberInput}
                  placeholder="e.g. Flat 402, Royal Residency, Near Metro Pillar 12"
                  placeholderTextColor="#94A3B8"
                  value={houseDetail}
                  onChangeText={setHouseDetail}
                />
                {houseDetail.length > 0 && (
                  <TouchableOpacity onPress={() => setHouseDetail("")}>
                    <Ionicons name="close-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.addressTagContainer}>
              <Text style={styles.addressTagTitle}>SAVE ADDRESS AS</Text>
              <View style={styles.addressTagRow}>
                {(["Home", "Work", "Other"] as const).map((tag) => {
                  const isSelected = addressTag === tag;
                  return (
                    <TouchableOpacity
                      key={tag}
                      style={[styles.addressTagChip, isSelected && styles.addressTagChipActive]}
                      activeOpacity={0.8}
                      onPress={() => setAddressTag(tag)}
                    >
                      {tag === "Home" && (
                        <Ionicons
                          name="home"
                          size={13}
                          color={isSelected ? "#FFFFFF" : "#475569"}
                          style={{ marginRight: 5 }}
                        />
                      )}
                      {tag === "Work" && (
                        <Ionicons
                          name="briefcase"
                          size={13}
                          color={isSelected ? "#FFFFFF" : "#475569"}
                          style={{ marginRight: 5 }}
                        />
                      )}
                      {tag === "Other" && (
                        <Ionicons
                          name="bookmark"
                          size={13}
                          color={isSelected ? "#FFFFFF" : "#475569"}
                          style={{ marginRight: 5 }}
                        />
                      )}
                      <Text style={[styles.addressTagText, isSelected && styles.addressTagTextActive]}>
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {addressTag === "Other" && (
                <View style={[styles.doorNumberInputWrapper, { marginTop: 8 }]}>
                  <Feather name="tag" size={16} color="#64748B" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.doorNumberInput}
                    placeholder="e.g. Mom's Place, Friend's Villa, Gym"
                    placeholderTextColor="#94A3B8"
                    value={customTagTitle}
                    onChangeText={setCustomTagTitle}
                  />
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.confirmAndSetLocationCTA}
              activeOpacity={0.9}
              onPress={handleConfirmPress}
            >
              <Text style={styles.confirmAndSetLocationCTAText}>
                {editing ? "Update Saved Address" : "Confirm & Save Address"}
              </Text>
              <Feather name="arrow-right" size={16} color="#FFFFFF" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  realMapModalRoot: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  realMapTopHeader: {
    paddingTop: Platform.OS === "ios" ? 52 : (StatusBar.currentHeight || 0) + 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    zIndex: 100,
  },
  realMapHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  realMapBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  realMapSearchInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  realMapSearchInput: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "600",
    color: "#0F172A",
  },
  searchResultsDropdown: {
    marginTop: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  searchResultItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#F1F5F9",
  },
  searchResultItemText: {
    fontSize: 12.5,
    color: "#1E293B",
    fontWeight: "500",
    flex: 1,
    lineHeight: 17,
  },

  halfScreenMapContainer: {
    height: height * 0.42,
    width: "100%",
    position: "relative",
    backgroundColor: "#F1F5F9",
  },
  mapFallbackContainer: {
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  mapFallbackTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#15803D",
  },
  mapFallbackSubtitle: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    marginTop: 4,
  },
  centerFixedPinOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  pinTooltipBubble: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.94)",
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 14,
    marginBottom: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  pinTooltipBubbleActive: {
    transform: [{ translateY: -4 }],
    backgroundColor: "#0F172A",
  },
  pinDotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4ADE80",
    marginRight: 6,
  },
  pinTooltipBubbleText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  pinIconWrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    marginTop: -16,
  },
  pinIconWrapperElevated: {
    transform: [{ translateY: -6 }],
  },
  pinCenterCoreDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    top: 9,
  },
  pinRadarRing: {
    width: 22,
    height: 9,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "rgba(21, 128, 61, 0.35)",
    backgroundColor: "rgba(21, 128, 61, 0.12)",
    marginTop: -8,
  },
  pinRadarRingActive: {
    borderColor: "rgba(21, 128, 61, 0.65)",
    backgroundColor: "rgba(21, 128, 61, 0.22)",
    transform: [{ scale: 1.25 }],
  },
  pinGroundShadowDot: {
    width: 8,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    marginTop: 2,
  },
  mapGpsRecenterBtn: {
    position: "absolute",
    bottom: 16,
    right: 14,
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 40,
  },

  bottomLocationCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: Platform.OS === "ios" ? 34 : 18,
  },
  bottomSheetScrollContent: {
    paddingBottom: 10,
  },
  pinnedAddressSummaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  pinnedAddressIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 2,
  },
  pinnedAddressDetailsCol: {
    flex: 1,
  },
  pinnedAddressHeaderFlex: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
  },
  pinnedAddressLabel: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#15803D",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pinnedAddressFullString: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 18,
  },

  doorNumberSection: {
    marginBottom: 12,
  },
  inputFieldTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  doorNumberInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  doorNumberInput: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: "600",
    color: "#0F172A",
  },

  addressTagContainer: {
    marginBottom: 14,
  },
  addressTagTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  addressTagRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  addressTagChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginRight: 8,
  },
  addressTagChipActive: {
    backgroundColor: "#15803D",
    borderColor: "#15803D",
  },
  addressTagText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#475569",
  },
  addressTagTextActive: {
    color: "#FFFFFF",
  },

  confirmAndSetLocationCTA: {
    backgroundColor: "#15803D",
    borderRadius: 15,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#15803D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmAndSetLocationCTAText: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});