import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import api from "@/src/lib/api";

type JoinRole = "customer" | "chef";
type MessageStatus = "new" | "read";
type FilterKey = "all" | "new" | "customer" | "chef";

interface WebsiteMessage {
  _id: string;
  type: "join";
  role: JoinRole;
  name: string;
  email: string;
  phone: string;
  city: string;
  about?: string;
  source?: string;
  status: MessageStatus;
  createdAt?: string;
  updatedAt?: string;
}

/* ═══════════════════════════════════════════════════════════
   THEME
═══════════════════════════════════════════════════════════ */
const T = {
  bg: "#0F172A",
  surface: "rgba(30, 41, 59, 0.6)",
  surfaceStrong: "rgba(30, 41, 59, 0.92)",
  border: "rgba(148, 163, 184, 0.15)",
  divider: "rgba(148, 163, 184, 0.12)",

  text: "#F8FAFC",
  textDim: "#CBD5E1",
  textMuted: "#94A3B8",
  textFaint: "#64748B",

  blue: "#60A5FA",
  amber: "#F59E0B",
  rose: "#F87171",
  emerald: "#34D399",
} as const;

/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */
const formatDate = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatRelative = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value).split(",")[0];
};

const getRoleLabel = (message: WebsiteMessage) => {
  return message.role === "chef" ? "Chef Partner" : "Customer";
};

const getRoleIcon = (
  message: WebsiteMessage
): keyof typeof Ionicons.glyphMap => {
  return message.role === "chef" ? "restaurant-outline" : "person-outline";
};

const getAccent = (message: WebsiteMessage): string => {
  return message.role === "chef" ? T.amber : T.blue;
};

/* ═══════════════════════════════════════════════════════════
   SCREEN
═══════════════════════════════════════════════════════════ */
export default function AllMsgsScreen() {
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<WebsiteMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null
  );
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  /* ── Load ── */
  const loadMessages = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setError("");

      const response = await api.get("/api/messages/admin");
      const data = response.data;

      if (!data?.success) {
        throw new Error(data?.message || "Failed to load messages");
      }

      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (err: any) {
      console.log(
        "❌ Failed to load messages:",
        err?.response?.data || err?.message || err
      );
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to load messages."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMessages();
    }, [loadMessages])
  );

  /* ── Mark read ── */
  const markAsRead = useCallback(async (message: WebsiteMessage) => {
    if (message.status === "read") return;

    try {
      await api.patch(`/api/messages/admin/${message._id}/read`);
      setMessages((current) =>
        current.map((item) =>
          item._id === message._id ? { ...item, status: "read" } : item
        )
      );
    } catch (err: any) {
      console.log(
        "❌ Failed to mark message as read:",
        err?.response?.data || err?.message || err
      );
    }
  }, []);

  /* ── Counts ── */
  const totalCount = messages.length;
  const newCount = useMemo(
    () => messages.filter((m) => m.status === "new").length,
    [messages]
  );
  const customerCount = useMemo(
    () => messages.filter((m) => m.role === "customer").length,
    [messages]
  );
  const chefCount = useMemo(
    () => messages.filter((m) => m.role === "chef").length,
    [messages]
  );

  const filteredMessages = useMemo(() => {
    const query = search.trim().toLowerCase();

    let base = messages;
    if (activeFilter === "new") base = base.filter((m) => m.status === "new");
    else if (activeFilter === "customer")
      base = base.filter((m) => m.role === "customer");
    else if (activeFilter === "chef")
      base = base.filter((m) => m.role === "chef");

    if (!query) return base;

    return base.filter((message) => {
      const haystack = [
        message.name,
        message.email,
        message.phone,
        message.city,
        message.about,
        message.role,
        message.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [messages, search, activeFilter]);

  /* ── Toggle expanded ── */
  const toggleExpanded = useCallback(
    (message: WebsiteMessage) => {
      setSelectedMessageId((current) =>
        current === message._id ? null : message._id
      );
      if (message.status === "new") markAsRead(message);
    },
    [markAsRead]
  );

  /* ── Loading state ── */
  if (loading && messages.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <View style={styles.loaderRing}>
            <ActivityIndicator size="large" color={T.blue} />
          </View>
          <Text style={styles.loadingText}>Loading messages...</Text>
          <Text style={styles.loadingHint}>
            Fetching latest submissions from the website
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.container, { paddingTop: insets.top > 0 ? 6 : 12 }]}>

        {/* ═══════════════ HEADER ═══════════════ */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="mail" size={18} color={T.blue} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                Messages
              </Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {newCount > 0
                  ? `${newCount} new · ${totalCount} total`
                  : `${totalCount} total submissions`}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => loadMessages(true)}
            disabled={refreshing}
            style={({ pressed }) => [
              styles.iconBtn,
              pressed && styles.pressed,
            ]}
            hitSlop={6}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={T.blue} />
            ) : (
              <Ionicons name="refresh" size={16} color={T.blue} />
            )}
          </Pressable>
        </View>

        {/* ═══════════════ STATS ═══════════════ */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsScroll}
        >
          <StatCard
            icon="layers-outline"
            label="Total"
            value={totalCount}
            accent={T.blue}
          />
          <StatCard
            icon="sparkles-outline"
            label="New"
            value={newCount}
            accent={T.rose}
          />
          <StatCard
            icon="person-outline"
            label="Customers"
            value={customerCount}
            accent={T.blue}
          />
          <StatCard
            icon="restaurant-outline"
            label="Chef Partners"
            value={chefCount}
            accent={T.amber}
          />
        </ScrollView>

        {/* ═══════════════ SEARCH ═══════════════ */}
        <View style={styles.searchWrap}>
          <Ionicons
            name="search"
            size={16}
            color={T.textFaint}
            style={{ marginLeft: 2 }}
          />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, email, phone, city..."
            placeholderTextColor={T.textFaint}
            autoCapitalize="none"
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch("")}
              hitSlop={8}
              style={styles.clearBtn}
            >
              <Ionicons
                name="close-circle"
                size={16}
                color={T.textFaint}
              />
            </Pressable>
          )}
        </View>

        {/* ═══════════════ FILTER PILLS ═══════════════ */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersScroll}
        >
          <FilterPill
            label="All"
            count={totalCount}
            active={activeFilter === "all"}
            onPress={() => setActiveFilter("all")}
            accent={T.blue}
          />
          <FilterPill
            label="Unread"
            count={newCount}
            active={activeFilter === "new"}
            onPress={() => setActiveFilter("new")}
            accent={T.rose}
          />
          <FilterPill
            label="Customers"
            count={customerCount}
            active={activeFilter === "customer"}
            onPress={() => setActiveFilter("customer")}
            accent={T.blue}
          />
          <FilterPill
            label="Chef Partners"
            count={chefCount}
            active={activeFilter === "chef"}
            onPress={() => setActiveFilter("chef")}
            accent={T.amber}
          />
        </ScrollView>

        {/* ═══════════════ ERROR ═══════════════ */}
        {error ? (
          <View style={styles.errorBox}>
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={T.rose}
              style={{ marginTop: 2 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorTitle}>Couldn’t load messages</Text>
              <Text style={styles.errorText} numberOfLines={3}>
                {error}
              </Text>
              <Pressable
                onPress={() => loadMessages()}
                style={({ pressed }) => [
                  styles.retryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="refresh" size={12} color={T.rose} />
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* ═══════════════ LIST ═══════════════ */}
        <FlatList
          data={filteredMessages}
          keyExtractor={(item) => String(item._id)}
          renderItem={({ item }) => (
            <MessageCard
              item={item}
              expanded={selectedMessageId === item._id}
              onToggle={() => toggleExpanded(item)}
            />
          )}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          contentContainerStyle={
            filteredMessages.length === 0
              ? [styles.emptyContent, { paddingBottom: 140 + insets.bottom }]
              : [styles.listContent, { paddingBottom: 140 + insets.bottom }]
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadMessages(true)}
              tintColor={T.blue}
              colors={[T.blue]}
              progressBackgroundColor="#1E293B"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons
                  name="mail-open-outline"
                  size={28}
                  color={T.blue}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {search || activeFilter !== "all"
                  ? "No matches found"
                  : "Inbox is empty"}
              </Text>
              <Text style={styles.emptyText}>
                {search || activeFilter !== "all"
                  ? "Try a different keyword or clear the filter."
                  : "Website submissions will appear here after a customer or chef fills the Join form."}
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}

/* ═══════════════════════════════════════════════════════════
   STAT CARD
═══════════════════════════════════════════════════════════ */
function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <View style={[styles.statCard, { borderColor: accent + "33" }]}>
      <View
        style={[
          styles.statIconWrap,
          { backgroundColor: accent + "1A", borderColor: accent + "40" },
        ]}
      >
        <Ionicons name={icon} size={13} color={accent} />
      </View>
      <Text style={styles.statNumber}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════
   FILTER PILL
═══════════════════════════════════════════════════════════ */
function FilterPill({
  label,
  count,
  active,
  onPress,
  accent,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
  accent: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterPill,
        active && {
          backgroundColor: accent + "1E",
          borderColor: accent + "66",
        },
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.filterPillText,
          active && { color: accent, fontWeight: "800" },
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.filterCount,
          active && { backgroundColor: accent + "33" },
        ]}
      >
        <Text
          style={[
            styles.filterCountText,
            active && { color: accent, fontWeight: "900" },
          ]}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

/* ═══════════════════════════════════════════════════════════
   MESSAGE CARD
═══════════════════════════════════════════════════════════ */
function MessageCard({
  item,
  expanded,
  onToggle,
}: {
  item: WebsiteMessage;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isNew = item.status === "new";
  const accent = getAccent(item);

  return (
    <View
      style={[
        styles.card,
        isNew && {
          borderColor: accent + "55",
          backgroundColor: T.surfaceStrong,
        },
      ]}
    >
      {/* Left accent rail */}
      <View
        style={[
          styles.cardRail,
          { backgroundColor: isNew ? accent : accent + "55" },
        ]}
      />

      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.cardHeader,
          pressed && styles.pressed,
        ]}
      >
        {/* Avatar */}
        <View
          style={[
            styles.avatarBubble,
            {
              backgroundColor: accent + "1E",
              borderColor: accent + "55",
            },
          ]}
        >
          <Ionicons
            name={getRoleIcon(item)}
            size={19}
            color={accent}
          />
        </View>

        {/* Body */}
        <View style={styles.cardBody}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name || "Unnamed"}
            </Text>
            {isNew && (
              <View
                style={[
                  styles.newPill,
                  {
                    backgroundColor: accent + "22",
                    borderColor: accent + "66",
                  },
                ]}
              >
                <View
                  style={[styles.newDot, { backgroundColor: accent }]}
                />
                <Text style={[styles.newPillText, { color: accent }]}>
                  NEW
                </Text>
              </View>
            )}
          </View>

          <View style={styles.metaRow}>
            <View
              style={[
                styles.rolePill,
                {
                  backgroundColor: accent + "16",
                  borderColor: accent + "40",
                },
              ]}
            >
              <Text style={[styles.rolePillText, { color: accent }]}>
                {getRoleLabel(item)}
              </Text>
            </View>

            <Text style={styles.metaSep}>·</Text>

            <Text style={styles.metaTime} numberOfLines={1}>
              {formatRelative(item.createdAt)}
            </Text>

            {item.city ? (
              <>
                <Text style={styles.metaSep}>·</Text>
                <View style={styles.cityChip}>
                  <Ionicons
                    name="location-outline"
                    size={10}
                    color={T.textFaint}
                  />
                  <Text style={styles.cityChipText} numberOfLines={1}>
                    {item.city}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        </View>

        {/* Chevron */}
        <View style={styles.chevronSlot}>
          <View style={styles.chevronWrap}>
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={T.textMuted}
            />
          </View>
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.details}>
          <View style={styles.divider} />

          <View style={styles.detailGrid}>
            <DetailCell
              label="Name"
              value={item.name}
              icon="person-outline"
            />
            <DetailCell
              label="Email"
              value={item.email}
              icon="mail-outline"
            />
            <DetailCell
              label="Phone"
              value={item.phone}
              icon="call-outline"
            />
            <DetailCell
              label="City"
              value={item.city}
              icon="location-outline"
            />
            <DetailCell
              label="Role"
              value={getRoleLabel(item)}
              icon={getRoleIcon(item)}
            />
            <DetailCell
              label="Status"
              value={item.status}
              icon="checkmark-circle-outline"
            />
            <DetailCell
              label="Submitted"
              value={formatDate(item.createdAt)}
              icon="time-outline"
              wide
            />
          </View>

          {item.about ? (
            <View style={styles.aboutBlock}>
              <View style={styles.aboutHeader}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={11}
                  color={T.textFaint}
                />
                <Text style={styles.aboutLabel}>Notes from sender</Text>
              </View>
              <Text style={styles.aboutText}>{item.about}</Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════
   DETAIL CELL
═══════════════════════════════════════════════════════════ */
function DetailCell({
  label,
  value,
  icon,
  wide = false,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  wide?: boolean;
}) {
  return (
    <View style={[styles.detailCell, wide && styles.detailCellWide]}>
      <View style={styles.detailLabelRow}>
        <Ionicons name={icon} size={10} color={T.textFaint} />
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text style={styles.detailValue} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════
   STYLES
═══════════════════════════════════════════════════════════ */
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: T.bg,
  },

  container: {
    flex: 1,
    paddingHorizontal: 16,
  },

  /* ── Header ── */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 14,
    gap: 12,
  },

  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },

  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(37, 99, 235, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: T.text,
    letterSpacing: -0.4,
  },

  headerSubtitle: {
    fontSize: 11.5,
    color: T.textMuted,
    fontWeight: "500",
    marginTop: 3,
  },

  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.28)",
  },

  /* ── Stats ── */
  statsScroll: {
    gap: 8,
    paddingRight: 4,
    paddingBottom: 12,
  },

  statCard: {
    minWidth: 104,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: T.surface,
    borderWidth: 1,
  },

  statIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },

  statNumber: {
    fontSize: 20,
    fontWeight: "900",
    color: T.text,
    letterSpacing: -0.5,
  },

  statLabel: {
    marginTop: 2,
    fontSize: 9.5,
    fontWeight: "700",
    color: T.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  /* ── Search ── */
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    marginBottom: 10,
  },

  searchInput: {
    flex: 1,
    color: T.text,
    fontSize: 13.5,
    fontWeight: "500",
    paddingVertical: 0,
  },

  clearBtn: {
    padding: 4,
  },

  /* ── Filters ── */
  filtersScroll: {
    gap: 6,
    paddingBottom: 12,
    paddingRight: 4,
  },

  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },

  filterPillText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: T.textMuted,
    letterSpacing: 0.2,
  },

  filterCount: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(148, 163, 184, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },

  filterCountText: {
    fontSize: 10,
    fontWeight: "800",
    color: T.textDim,
  },

  /* ── List containers ── */
  listContent: {
    paddingTop: 2,
  },

  emptyContent: {
    flexGrow: 1,
    justifyContent: "center",
  },

  /* ── Card ── */
  card: {
    borderRadius: 16,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    overflow: "hidden",
  },

  cardRail: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },

  cardHeader: {
    minHeight: 74,
    paddingLeft: 15,
    paddingRight: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  pressed: {
    opacity: 0.72,
  },

  avatarBubble: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  cardBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  name: {
    flexShrink: 1,
    fontSize: 14.5,
    fontWeight: "800",
    color: T.text,
    letterSpacing: -0.2,
  },

  newPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },

  newDot: {
    width: 5,
    height: 5,
    borderRadius: 99,
  },

  newPillText: {
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  metaRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  rolePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },

  rolePillText: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },

  metaSep: {
    fontSize: 11,
    color: T.textFaint,
    fontWeight: "700",
  },

  metaTime: {
    fontSize: 11,
    color: T.textMuted,
    fontWeight: "500",
  },

  cityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 1,
    minWidth: 0,
  },

  cityChipText: {
    fontSize: 10.5,
    color: T.textFaint,
    fontWeight: "500",
    flexShrink: 1,
  },

  chevronSlot: {
    width: 30,
    height: 30,
    marginLeft: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  chevronWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "rgba(148, 163, 184, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },

  /* ── Expanded details ── */
  details: {
    paddingLeft: 15,
    paddingRight: 14,
    paddingBottom: 14,
  },

  divider: {
    height: 1,
    backgroundColor: T.divider,
    marginBottom: 14,
  },

  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
  },

  detailCell: {
    width: "50%",
    paddingHorizontal: 6,
    paddingVertical: 6,
  },

  detailCellWide: {
    width: "100%",
  },

  detailLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 5,
  },

  detailLabel: {
    fontSize: 9.5,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: T.textFaint,
  },

  detailValue: {
    fontSize: 13,
    lineHeight: 18,
    color: T.textDim,
    fontWeight: "600",
  },

  aboutBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: T.divider,
  },

  aboutHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 7,
  },

  aboutLabel: {
    fontSize: 9.5,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: T.textFaint,
  },

  aboutText: {
    fontSize: 13,
    lineHeight: 20,
    color: T.textDim,
    fontWeight: "500",
  },

  /* ── Error ── */
  errorBox: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(127, 29, 29, 0.35)",
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.4)",
  },

  errorTitle: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#FCA5A5",
    marginBottom: 3,
  },

  errorText: {
    fontSize: 12,
    lineHeight: 17,
    color: "#FCA5A5",
    opacity: 0.85,
    fontWeight: "500",
  },

  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(30, 41, 59, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.5)",
  },

  retryText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#FCA5A5",
    letterSpacing: 0.3,
  },

  /* ── Empty ── */
  emptyState: {
    alignItems: "center",
    paddingHorizontal: 24,
  },

  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "rgba(37, 99, 235, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: T.text,
    textAlign: "center",
  },

  emptyText: {
    marginTop: 8,
    fontSize: 12.5,
    lineHeight: 18,
    color: T.textMuted,
    textAlign: "center",
    maxWidth: 300,
  },

  /* ── Loading ── */
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  loaderRing: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "rgba(37, 99, 235, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  loadingText: {
    fontSize: 14,
    color: T.text,
    fontWeight: "700",
  },

  loadingHint: {
    marginTop: 6,
    fontSize: 12,
    color: T.textMuted,
    fontWeight: "500",
  },
});