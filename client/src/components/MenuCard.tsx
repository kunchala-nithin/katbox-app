import React, { useRef } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  Animated,
  Pressable,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function MenuCard({
  menu,
  showActions = false,
  onEdit,
  onDelete,
  onAddItems,
  onPress,
}: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const editScale = useRef(new Animated.Value(1)).current;
  const deleteScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  };

  const animateIcon = (anim: Animated.Value, to: number) => {
    Animated.spring(anim, {
      toValue: to,
      useNativeDriver: true,
      speed: 50,
      bounciness: 8,
    }).start();
  };

  // Dynamic items count (prefer itemsPerPlate, fallback to plateItems length)
  const itemsCount =
    menu.itemsPerPlate !== undefined && menu.itemsPerPlate !== null
      ? Number(menu.itemsPerPlate)
      : (menu.plateItems?.length || 0);

  const isNonVeg = Boolean(menu.isNonVeg);

  return (
    <View style={styles.cardContainer}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <View style={styles.card}>
          <Pressable
            onPress={onPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={!onPress}
          >
            <View style={styles.heroContainer}>
              <Image source={{ uri: menu.heroImageUrl }} style={styles.hero} />

              {/* Merged Premium Veg / Non-Veg Tag */}
              {menu.isNonVeg !== undefined && (
                <View
                  style={[
                    styles.dietTag,
                    isNonVeg ? styles.dietTagNonVeg : styles.dietTagVeg,
                  ]}
                >
                  <View
                    style={[
                      styles.dietIndicatorBox,
                      isNonVeg ? styles.indicatorNonVeg : styles.indicatorVeg,
                    ]}
                  >
                    <View
                      style={[
                        styles.dietIndicatorDot,
                        isNonVeg ? styles.dotNonVeg : styles.dotVeg,
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.dietTagText,
                      isNonVeg ? styles.dietTextNonVeg : styles.dietTextVeg,
                    ]}
                  >
                    {isNonVeg ? "Non-Veg" : "Veg"}
                  </Text>
                </View>
              )}

              {showActions && (
                <>
                  <Animated.View
                    style={[
                      styles.iconWrapper,
                      { left: 16, transform: [{ scale: editScale }] },
                    ]}
                  >
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPressIn={() => animateIcon(editScale, 0.85)}
                      onPressOut={() => animateIcon(editScale, 1)}
                      onPress={(e) => {
                        e.stopPropagation();
                        onEdit?.(menu);
                      }}
                      style={styles.actionBtn}
                    >
                      <Ionicons name="create-outline" size={20} color="#166538" />
                    </TouchableOpacity>
                  </Animated.View>

                  <Animated.View
                    style={[
                      styles.iconWrapper,
                      { left: 62, transform: [{ scale: deleteScale }] },
                    ]}
                  >
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPressIn={() => animateIcon(deleteScale, 0.85)}
                      onPressOut={() => animateIcon(deleteScale, 1)}
                      onPress={(e) => {
                        e.stopPropagation();
                        onDelete?.(menu);
                      }}
                      style={[styles.actionBtn, styles.deleteBtnBg]}
                    >
                      <Ionicons name="trash-outline" size={20} color="#dc2626" />
                    </TouchableOpacity>
                  </Animated.View>
                </>
              )}
            </View>

            <View style={styles.headerBody}>
              <View style={styles.row}>
                <Text numberOfLines={1} style={styles.title}>
                  {menu.name}
                </Text>

                <Text numberOfLines={1} style={styles.price}>
                  Starts @ <Text style={styles.priceBold}>₹{menu.price}</Text>{" "}
                  <Text style={styles.perPlate}>/Plate</Text>
                </Text>
              </View>

              <View style={styles.separator} />
            </View>
          </Pressable>

          <View style={styles.body}>
            {/* Dynamic count placed beside the section title */}
            <View style={styles.sectionRow}>
              <Text style={styles.section}>WHAT’S IN THE PLATE</Text>
              <Text style={styles.sectionCount}>
                : {itemsCount} item{itemsCount !== 1 ? "s" : ""}
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.itemsScroll}
              contentContainerStyle={styles.itemsContainer}
              decelerationRate="fast"
              scrollEventThrottle={16}
            >
              {menu.plateItems?.map((item: any, i: number) => (
                <View key={item._id || item.id || i} style={styles.itemWrapper}>
                  <View style={styles.itemCircle}>
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.itemImg}
                    />
                  </View>
                  <Text numberOfLines={1} style={styles.itemText}>
                    {item.name}
                  </Text>
                </View>
              ))}
            </ScrollView>

            {onAddItems && (
              <TouchableOpacity
                style={styles.addItemsBtn}
                onPress={() => onAddItems(menu)}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={styles.addItemsText}>Add Items</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    paddingHorizontal: 4,
    paddingVertical: 6,
    backgroundColor: "#f8f9fa",
  },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },

  heroContainer: {
    position: "relative",
    width: "100%",
    height: 190,
  },

  hero: {
    width: "100%",
    height: "100%",
  },

  /* Seamless Tag Embedded on the Top-Right Card Edge */
  dietTag: {
    position: "absolute",
    top: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomLeftRadius: 10,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },

  dietTagVeg: {
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderColor: "rgba(22, 101, 56, 0.25)",
  },

  dietTagNonVeg: {
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderColor: "rgba(220, 38, 38, 0.25)",
  },

  dietIndicatorBox: {
    width: 11,
    height: 11,
    borderWidth: 1.5,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },

  indicatorVeg: {
    borderColor: "#166538",
  },

  indicatorNonVeg: {
    borderColor: "#dc2626",
  },

  dietIndicatorDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.25,
  },

  dotVeg: {
    backgroundColor: "#166538",
  },

  dotNonVeg: {
    backgroundColor: "#dc2626",
  },

  dietTagText: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },

  dietTextVeg: {
    color: "#166538",
  },

  dietTextNonVeg: {
    color: "#dc2626",
  },

  iconWrapper: {
    position: "absolute",
    top: 10,
    zIndex: 10,
  },

  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },

  deleteBtnBg: {
    backgroundColor: "rgba(254, 242, 242, 0.92)",
  },

  headerBody: {
    paddingTop: 14,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
  },

  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111",
    flex: 1,
  },

  price: {
    fontSize: 11.5,
    color: "#6b7280",
  },

  priceBold: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111",
  },

  perPlate: {
    fontSize: 10.5,
    color: "#6b7280",
  },

  separator: {
    height: 1,
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d1d5db",
    marginTop: 10,
    marginBottom: 2,
    width: "100%",
  },

  body: {
    paddingBottom: 12,
  },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 8,
  },

  section: {
    color: "#1B5E20",
    fontWeight: "800",
    fontSize: 11.5,
    letterSpacing: 0.5,
  },

  sectionCount: {
    color: "#1B5E20",
    fontWeight: "700",
    fontSize: 11,
    marginLeft: 4,
  },

  itemWrapper: {
    alignItems: "center",
    marginRight: 8,
    width: 56,
  },

  itemCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },

  itemImg: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },

  itemText: {
    fontSize: 10,
    marginTop: 5,
    textAlign: "center",
    color: "#374151",
  },

  addItemsBtn: {
    marginTop: 12,
    backgroundColor: "#1B5E20",
    paddingVertical: 9,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 14,
  },

  addItemsText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 12,
  },

  itemsScroll: {
    marginRight: -14,
  },

  itemsContainer: {
    paddingLeft: 14,
    paddingRight: 16,
  },
});