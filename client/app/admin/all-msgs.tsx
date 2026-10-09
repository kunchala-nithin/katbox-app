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

type MessageType = "join" | "newsletter";
type JoinRole = "customer" | "chef";
type MessageStatus = "new" | "read";

type FilterKey =
  | "all"
  | "new"
  | "customer"
  | "chef"
  | "newsletter";

interface WebsiteMessage {
  _id: string;
  type: MessageType;
  role?: JoinRole;
  name?: string;
  email: string;
  phone?: string;
  city?: string;
  about?: string;
  source?: string;
  status: MessageStatus;
  createdAt?: string;
  updatedAt?: string;
}

/* ═══════════════════════════════════════════════════════════
   THEME — softer, warmer, chat-friendly dark palette
═══════════════════════════════════════════════════════════ */
const T = {
  // Backgrounds
  bg: "#0A1017",
  bgSoft: "#0E1620",
  surface: "#131D2A",
  surfaceElevated: "#182536",
  surfaceGlass: "rgba(24, 37, 54, 0.72)",
  surfaceGlassSoft: "rgba(24, 37, 54, 0.45)",

  // Borders / dividers
  border: "rgba(148, 163, 184, 0.10)",
  borderStrong: "rgba(148, 163, 184, 0.18)",
  divider: "rgba(148, 163, 184, 0.08)",

  // Text
  text: "#F1F5F9",
  textDim: "#CBD5E1",
  textMuted: "#94A3B8",
  textFaint: "#64748B",

  // Accents
  blue: "#60A5FA",
  blueSoft: "rgba(96, 165, 250, 0.14)",

  amber: "#FBBF24",
  amberSoft: "rgba(251, 191, 36, 0.14)",

  rose: "#FB7185",
  roseSoft: "rgba(251, 113, 133, 0.14)",

  emerald: "#34D399",
  emeraldSoft: "rgba(52, 211, 153, 0.14)",

  purple: "#A78BFA",
  purpleSoft: "rgba(167, 139, 250, 0.14)",
} as const;

/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */

const formatDate = (value?: string) => {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

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

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);

  if (mins < 1) {
    return "just now";
  }

  if (mins < 60) {
    return `${mins}m`;
  }

  const hrs = Math.floor(mins / 60);

  if (hrs < 24) {
    return `${hrs}h`;
  }

  const days = Math.floor(hrs / 24);

  if (days < 7) {
    return `${days}d`;
  }

  return formatDate(value).split(",")[0];
};

const getRoleLabel = (message: WebsiteMessage) => {
  if (message.type === "newsletter") {
    return "Newsletter";
  }

  return message.role === "chef"
    ? "Chef Partner"
    : "Customer";
};

const getRoleIcon = (
  message: WebsiteMessage
): keyof typeof Ionicons.glyphMap => {
  if (message.type === "newsletter") {
    return "mail-outline";
  }

  return message.role === "chef"
    ? "restaurant-outline"
    : "person-outline";
};

const getAccent = (message: WebsiteMessage): string => {
  if (message.type === "newsletter") {
    return T.purple;
  }

  return message.role === "chef"
    ? T.amber
    : T.blue;
};

const getAccentSoft = (message: WebsiteMessage): string => {
  if (message.type === "newsletter") {
    return T.purpleSoft;
  }

  return message.role === "chef"
    ? T.amberSoft
    : T.blueSoft;
};

const getInitials = (name?: string) => {
  if (!name) {
    return "?";
  }

  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[parts.length - 1][0]
  ).toUpperCase();
};

const getMessageDisplayName = (message: WebsiteMessage) => {
  if (message.type === "newsletter") {
    return "Newsletter Subscriber";
  }

  return message.name?.trim() || "Unnamed";
};

const getMessagePreview = (message: WebsiteMessage) => {
  if (message.type === "newsletter") {
    return message.email || "Newsletter subscription";
  }

  if (message.about?.trim()) {
    return message.about.trim();
  }

  if (message.email && message.phone) {
    return `${message.email} • ${message.phone}`;
  }

  if (message.email) {
    return message.email;
  }

  if (message.phone) {
    return message.phone;
  }

  return "No additional information";
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

  /* ── Load messages ── */
  const loadMessages = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const response = await api.get(
          "/api/messages/admin"
        );

        const data = response.data;

        if (!data?.success) {
          throw new Error(
            data?.message ||
              "Failed to load messages"
          );
        }

        setMessages(
          Array.isArray(data.messages)
            ? data.messages
            : []
        );
      } catch (err: any) {
        console.log(
          "❌ Failed to load messages:",
          err?.response?.data ||
            err?.message ||
            err
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
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      loadMessages();
    }, [loadMessages])
  );

  /* ── Mark read ── */
  const markAsRead = useCallback(
    async (message: WebsiteMessage) => {
      if (message.status === "read") {
        return;
      }

      try {
        await api.patch(
          `/api/messages/admin/${message._id}/read`
        );

        setMessages((current) =>
          current.map((item) =>
            item._id === message._id
              ? {
                  ...item,
                  status: "read",
                }
              : item
          )
        );
      } catch (err: any) {
        console.log(
          "❌ Failed to mark message as read:",
          err?.response?.data ||
            err?.message ||
            err
        );
      }
    },
    []
  );

  /* ── Counts ── */

  const totalCount = messages.length;

  const newCount = useMemo(
    () =>
      messages.filter(
        (message) =>
          message.status === "new"
      ).length,
    [messages]
  );

  const customerCount = useMemo(
    () =>
      messages.filter(
        (message) =>
          message.type === "join" &&
          message.role === "customer"
      ).length,
    [messages]
  );

  const chefCount = useMemo(
    () =>
      messages.filter(
        (message) =>
          message.type === "join" &&
          message.role === "chef"
      ).length,
    [messages]
  );

  const newsletterCount = useMemo(
    () =>
      messages.filter(
        (message) =>
          message.type === "newsletter"
      ).length,
    [messages]
  );

  /* ── Filter + Search ── */
  const filteredMessages = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase();

    let base = messages;

    if (activeFilter === "new") {
      base = base.filter(
        (message) =>
          message.status === "new"
      );
    } else if (
      activeFilter === "customer"
    ) {
      base = base.filter(
        (message) =>
          message.type === "join" &&
          message.role === "customer"
      );
    } else if (activeFilter === "chef") {
      base = base.filter(
        (message) =>
          message.type === "join" &&
          message.role === "chef"
      );
    } else if (
      activeFilter === "newsletter"
    ) {
      base = base.filter(
        (message) =>
          message.type === "newsletter"
      );
    }

    if (!query) {
      return base;
    }

    return base.filter((message) => {
      const haystack = [
        message.type,
        message.role,
        message.name,
        message.email,
        message.phone,
        message.city,
        message.about,
        message.source,
        message.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [
    messages,
    search,
    activeFilter,
  ]);

  /* ── Toggle expanded ── */
  const toggleExpanded = useCallback(
    (message: WebsiteMessage) => {
      setSelectedMessageId((current) =>
        current === message._id
          ? null
          : message._id
      );

      if (message.status === "new") {
        markAsRead(message);
      }
    },
    [markAsRead]
  );

  /* ── Loading state ── */
  if (
    loading &&
    messages.length === 0
  ) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View style={styles.center}>
          <View style={styles.loaderRing}>
            <ActivityIndicator
              size="large"
              color={T.blue}
            />
          </View>

          <Text style={styles.loadingText}>
            Loading messages…
          </Text>

          <Text style={styles.loadingHint}>
            Fetching the latest from the website
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <View
        style={[
          styles.container,
          {
            paddingTop:
              insets.top > 0
                ? 6
                : 12,
          },
        ]}
      >
        {/* ═══════════════ HEADER ═══════════════ */}

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View
              style={styles.headerIconWrap}
            >
              <Ionicons
                name="chatbubbles"
                size={20}
                color={T.blue}
              />
            </View>

            <View
              style={{
                flex: 1,
                minWidth: 0,
              }}
            >
              <Text
                style={styles.headerTitle}
                numberOfLines={1}
              >
                Messages
              </Text>

              <Text
                style={styles.headerSubtitle}
                numberOfLines={1}
              >
                {newCount > 0
                  ? `${newCount} new · ${totalCount} total`
                  : `${totalCount} total submissions`}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() =>
              loadMessages(true)
            }
            disabled={refreshing}
            style={({ pressed }) => [
              styles.iconBtn,
              pressed &&
                styles.pressed,
            ]}
            hitSlop={6}
          >
            {refreshing ? (
              <ActivityIndicator
                size="small"
                color={T.blue}
              />
            ) : (
              <Ionicons
                name="refresh"
                size={17}
                color={T.blue}
              />
            )}
          </Pressable>
        </View>

        {/* ═══════════════ STATS ═══════════════ */}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.statsScroll
          }
        >
          <StatCard
            icon="layers"
            label="Total"
            value={totalCount}
            accent={T.blue}
          />

          <StatCard
            icon="sparkles"
            label="New"
            value={newCount}
            accent={T.rose}
          />

          <StatCard
            icon="person"
            label="Customers"
            value={customerCount}
            accent={T.emerald}
          />

          <StatCard
            icon="restaurant"
            label="Chefs"
            value={chefCount}
            accent={T.amber}
          />

          <StatCard
            icon="mail"
            label="Newsletter"
            value={newsletterCount}
            accent={T.purple}
          />
        </ScrollView>

        {/* ═══════════════ SEARCH ═══════════════ */}

        <View style={styles.searchWrap}>
          <Ionicons
            name="search"
            size={16}
            color={T.textFaint}
            style={{
              marginLeft: 2,
            }}
          />

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, email, phone, city…"
            placeholderTextColor={
              T.textFaint
            }
            autoCapitalize="none"
            style={styles.searchInput}
          />

          {search.length > 0 && (
            <Pressable
              onPress={() =>
                setSearch("")
              }
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
          showsHorizontalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.filtersScroll
          }
        >
          <FilterPill
            label="All"
            count={totalCount}
            active={
              activeFilter === "all"
            }
            onPress={() =>
              setActiveFilter("all")
            }
            accent={T.blue}
          />

          <FilterPill
            label="Unread"
            count={newCount}
            active={
              activeFilter === "new"
            }
            onPress={() =>
              setActiveFilter("new")
            }
            accent={T.rose}
          />

          <FilterPill
            label="Customers"
            count={customerCount}
            active={
              activeFilter ===
              "customer"
            }
            onPress={() =>
              setActiveFilter(
                "customer"
              )
            }
            accent={T.emerald}
          />

          <FilterPill
            label="Chefs"
            count={chefCount}
            active={
              activeFilter === "chef"
            }
            onPress={() =>
              setActiveFilter("chef")
            }
            accent={T.amber}
          />

          <FilterPill
            label="Newsletter"
            count={newsletterCount}
            active={
              activeFilter ===
              "newsletter"
            }
            onPress={() =>
              setActiveFilter(
                "newsletter"
              )
            }
            accent={T.purple}
          />
        </ScrollView>

        {/* ═══════════════ ERROR ═══════════════ */}

        {error ? (
          <View style={styles.errorBox}>
            <View
              style={styles.errorIconWrap}
            >
              <Ionicons
                name="alert-circle"
                size={16}
                color={T.rose}
              />
            </View>

            <View
              style={{
                flex: 1,
              }}
            >
              <Text
                style={styles.errorTitle}
              >
                Couldn’t load messages
              </Text>

              <Text
                style={styles.errorText}
                numberOfLines={3}
              >
                {error}
              </Text>

              <Pressable
                onPress={() =>
                  loadMessages()
                }
                style={({ pressed }) => [
                  styles.retryButton,
                  pressed &&
                    styles.pressed,
                ]}
              >
                <Ionicons
                  name="refresh"
                  size={12}
                  color={T.rose}
                />

                <Text
                  style={styles.retryText}
                >
                  Try again
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* ═══════════════ LIST ═══════════════ */}

        <FlatList
          data={filteredMessages}
          keyExtractor={(item) =>
            String(item._id)
          }
          renderItem={({ item }) => (
            <MessageCard
              item={item}
              expanded={
                selectedMessageId ===
                item._id
              }
              onToggle={() =>
                toggleExpanded(item)
              }
            />
          )}
          showsVerticalScrollIndicator={
            false
          }
          ItemSeparatorComponent={() => (
            <View
              style={{
                height: 10,
              }}
            />
          )}
          contentContainerStyle={
            filteredMessages.length === 0
              ? [
                  styles.emptyContent,
                  {
                    paddingBottom:
                      140 +
                      insets.bottom,
                  },
                ]
              : [
                  styles.listContent,
                  {
                    paddingBottom:
                      140 +
                      insets.bottom,
                  },
                ]
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() =>
                loadMessages(true)
              }
              tintColor={T.blue}
              colors={[T.blue]}
              progressBackgroundColor={
                T.surfaceElevated
              }
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View
                style={
                  styles.emptyIconWrap
                }
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={30}
                  color={T.blue}
                />
              </View>

              <Text
                style={styles.emptyTitle}
              >
                {search ||
                activeFilter !==
                  "all"
                  ? "No matches found"
                  : "No messages yet"}
              </Text>

              <Text
                style={styles.emptyText}
              >
                {search ||
                activeFilter !==
                  "all"
                  ? "Try a different keyword or clear the filter."
                  : "Website submissions will appear here after a customer, chef or newsletter subscriber submits the website form."}
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
    <View style={styles.statCard}>
      <View
        style={[
          styles.statAccent,
          {
            backgroundColor: accent,
          },
        ]}
      />

      <View
        style={styles.statTopRow}
      >
        <View
          style={[
            styles.statIconWrap,
            {
              backgroundColor:
                accent + "1F",
            },
          ]}
        >
          <Ionicons
            name={icon}
            size={13}
            color={accent}
          />
        </View>

        <Text
          style={styles.statLabel}
        >
          {label}
        </Text>
      </View>

      <Text
        style={styles.statNumber}
      >
        {value}
      </Text>
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
          backgroundColor:
            accent + "1C",
          borderColor:
            accent + "66",
        },
        pressed &&
          styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.filterPillText,
          active && {
            color: accent,
            fontWeight: "800",
          },
        ]}
      >
        {label}
      </Text>

      <View
        style={[
          styles.filterCount,
          active && {
            backgroundColor:
              accent + "2E",
          },
        ]}
      >
        <Text
          style={[
            styles.filterCountText,
            active && {
              color: accent,
              fontWeight: "900",
            },
          ]}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

/* ═══════════════════════════════════════════════════════════
   MESSAGE CARD — chat-style row
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
  const isNew =
    item.status === "new";

  const accent =
    getAccent(item);

  const accentSoft =
    getAccentSoft(item);

  const displayName =
    getMessageDisplayName(item);

  const initials =
    item.type === "newsletter"
      ? "NL"
      : getInitials(item.name);

  return (
    <View
      style={[
        styles.card,
        isNew &&
          styles.cardUnread,
        isNew && {
          borderColor:
            accent + "33",
        },
      ]}
    >
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.cardHeader,
          pressed &&
            styles.pressed,
        ]}
      >
        {/* Avatar */}

        <View
          style={[
            styles.avatarBubble,
            {
              backgroundColor:
                accentSoft,
              borderColor:
                accent + "44",
            },
          ]}
        >
          <Text
            style={[
              styles.avatarText,
              {
                color: accent,
              },
            ]}
          >
            {initials}
          </Text>

          {isNew && (
            <View
              style={[
                styles.avatarDot,
                {
                  backgroundColor:
                    accent,
                },
              ]}
            />
          )}
        </View>

        {/* Body */}

        <View style={styles.cardBody}>
          <View
            style={styles.titleRow}
          >
            <Text
              style={[
                styles.name,
                isNew &&
                  styles.nameUnread,
              ]}
              numberOfLines={1}
            >
              {displayName}
            </Text>

            <Text
              style={styles.timeText}
              numberOfLines={1}
            >
              {formatRelative(
                item.createdAt
              )}
            </Text>
          </View>

          <View
            style={styles.previewRow}
          >
            <View
              style={[
                styles.roleChip,
                {
                  backgroundColor:
                    accentSoft,
                  borderColor:
                    accent + "44",
                },
              ]}
            >
              <Ionicons
                name={getRoleIcon(
                  item
                )}
                size={9}
                color={accent}
              />

              <Text
                style={[
                  styles.roleChipText,
                  {
                    color: accent,
                  },
                ]}
              >
                {getRoleLabel(
                  item
                )}
              </Text>
            </View>

            {item.type ===
              "join" &&
            item.city ? (
              <View
                style={
                  styles.cityChip
                }
              >
                <Ionicons
                  name="location"
                  size={10}
                  color={
                    T.textFaint
                  }
                />

                <Text
                  style={
                    styles.cityChipText
                  }
                  numberOfLines={1}
                >
                  {item.city}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Preview */}

          <Text
            style={[
              styles.previewText,
              isNew &&
                styles.previewTextUnread,
            ]}
            numberOfLines={1}
          >
            {getMessagePreview(
              item
            )}
          </Text>
        </View>

        {/* Chevron */}

        <View
          style={styles.chevronSlot}
        >
          <Ionicons
            name={
              expanded
                ? "chevron-up"
                : "chevron-down"
            }
            size={16}
            color={
              T.textMuted
            }
          />
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.details}>
          <View
            style={styles.divider}
          />

          {item.type ===
          "newsletter" ? (
            <NewsletterDetails
              item={item}
              accent={accent}
            />
          ) : (
            <JoinDetails
              item={item}
            />
          )}
        </View>
      )}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════
   JOIN DETAILS
═══════════════════════════════════════════════════════════ */

function JoinDetails({
  item,
}: {
  item: WebsiteMessage;
}) {
  const accent =
    getAccent(item);

  return (
    <>
      <View
        style={styles.detailGrid}
      >
        <DetailCell
          label="Name"
          value={
            item.name ||
            "Not provided"
          }
          icon="person-outline"
        />

        <DetailCell
          label="Email"
          value={
            item.email ||
            "Not provided"
          }
          icon="mail-outline"
        />

        <DetailCell
          label="Phone"
          value={
            item.phone ||
            "Not provided"
          }
          icon="call-outline"
        />

        <DetailCell
          label="City"
          value={
            item.city ||
            "Not provided"
          }
          icon="location-outline"
        />

        <DetailCell
          label="Role"
          value={getRoleLabel(
            item
          )}
          icon={getRoleIcon(
            item
          )}
        />

        <DetailCell
          label="Status"
          value={
            item.status
          }
          icon="checkmark-circle-outline"
        />

        <DetailCell
          label="Submitted"
          value={
            formatDate(
              item.createdAt
            ) ||
            "Unknown"
          }
          icon="time-outline"
          wide
        />

        {item.source ? (
          <DetailCell
            label="Source"
            value={
              item.source
            }
            icon="globe-outline"
            wide
          />
        ) : null}
      </View>

      {item.about ? (
        <View
          style={styles.aboutBlock}
        >
          <View
            style={
              styles.aboutHeader
            }
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={12}
              color={accent}
            />

            <Text
              style={[
                styles.aboutLabel,
                {
                  color: accent,
                },
              ]}
            >
              Notes from sender
            </Text>
          </View>

          <Text
            style={styles.aboutText}
          >
            {item.about}
          </Text>
        </View>
      ) : null}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   NEWSLETTER DETAILS
═══════════════════════════════════════════════════════════ */

function NewsletterDetails({
  item,
  accent,
}: {
  item: WebsiteMessage;
  accent: string;
}) {
  return (
    <>
      <View
        style={[
          styles.newsletterBanner,
          {
            backgroundColor:
              T.purpleSoft,
            borderColor:
              accent + "33",
          },
        ]}
      >
        <View
          style={[
            styles.newsletterIconWrap,
            {
              backgroundColor:
                accent + "22",
            },
          ]}
        >
          <Ionicons
            name="mail"
            size={18}
            color={accent}
          />
        </View>

        <View
          style={{
            flex: 1,
          }}
        >
          <Text
            style={[
              styles.newsletterTitle,
              {
                color: accent,
              },
            ]}
          >
            Newsletter Subscriber
          </Text>

          <Text
            style={
              styles.newsletterSubtitle
            }
          >
            This person subscribed
            through the Katbox website.
          </Text>
        </View>
      </View>

      <View
        style={styles.detailGrid}
      >
        <DetailCell
          label="Email"
          value={
            item.email ||
            "Not provided"
          }
          icon="mail-outline"
          wide
        />

        <DetailCell
          label="Status"
          value={
            item.status
          }
          icon="checkmark-circle-outline"
        />

        <DetailCell
          label="Submitted"
          value={
            formatDate(
              item.createdAt
            ) ||
            "Unknown"
          }
          icon="time-outline"
        />

        {item.source ? (
          <DetailCell
            label="Source"
            value={
              item.source
            }
            icon="globe-outline"
            wide
          />
        ) : null}
      </View>
    </>
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
    <View
      style={[
        styles.detailCell,
        wide &&
          styles.detailCellWide,
      ]}
    >
      <View
        style={
          styles.detailLabelRow
        }
      >
        <Ionicons
          name={icon}
          size={10}
          color={T.textFaint}
        />

        <Text
          style={
            styles.detailLabel
          }
        >
          {label}
        </Text>
      </View>

      <Text
        style={
          styles.detailValue
        }
        numberOfLines={3}
      >
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
    paddingBottom: 16,
    gap: 12,
  },

  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },

  headerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: T.blueSoft,
    borderWidth: 1,
    borderColor:
      "rgba(96, 165, 250, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: T.text,
    letterSpacing: -0.4,
  },

  headerSubtitle: {
    fontSize: 12,
    color: T.textMuted,
    fontWeight: "500",
    marginTop: 3,
    letterSpacing: 0.1,
  },

  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      T.surfaceGlass,
    borderWidth: 1,
    borderColor:
      "rgba(96, 165, 250, 0.22)",
  },

  /* ── Stats ── */

  statsScroll: {
    gap: 10,
    paddingRight: 4,
    paddingBottom: 14,
  },

  statCard: {
    minWidth: 112,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    overflow: "hidden",
  },

  statAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.7,
  },

  statTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },

  statIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  statNumber: {
    fontSize: 22,
    fontWeight: "900",
    color: T.text,
    letterSpacing: -0.6,
  },

  statLabel: {
    fontSize: 9.5,
    fontWeight: "700",
    color: T.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },

  /* ── Search ── */

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.borderStrong,
    marginBottom: 12,
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
    gap: 8,
    paddingBottom: 14,
    paddingRight: 4,
  },

  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 13,
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
    backgroundColor:
      "rgba(148, 163, 184, 0.15)",
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
    borderRadius: 18,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    overflow: "hidden",
  },

  cardUnread: {
    backgroundColor:
      T.surfaceElevated,
  },

  cardHeader: {
    minHeight: 82,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  pressed: {
    opacity: 0.7,
  },

  avatarBubble: {
    width: 46,
    height: 46,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    position: "relative",
  },

  avatarText: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  avatarDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor:
      T.surfaceElevated,
  },

  cardBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent:
      "space-between",
    gap: 8,
  },

  name: {
    flexShrink: 1,
    fontSize: 14.5,
    fontWeight: "700",
    color: T.textDim,
    letterSpacing: -0.2,
  },

  nameUnread: {
    fontWeight: "800",
    color: T.text,
  },

  timeText: {
    fontSize: 11,
    fontWeight: "600",
    color: T.textFaint,
  },

  previewRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  roleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },

  roleChipText: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform:
      "uppercase",
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

  previewText: {
    marginTop: 6,
    fontSize: 12.5,
    color: T.textFaint,
    fontWeight: "500",
    lineHeight: 17,
  },

  previewTextUnread: {
    color: T.textMuted,
    fontWeight: "600",
  },

  chevronSlot: {
    width: 30,
    height: 30,
    marginLeft: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  /* ── Expanded details ── */

  details: {
    paddingHorizontal: 14,
    paddingBottom: 16,
  },

  divider: {
    height: 1,
    backgroundColor:
      T.divider,
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
    textTransform:
      "uppercase",
    letterSpacing: 0.7,
    color: T.textFaint,
  },

  detailValue: {
    fontSize: 13,
    lineHeight: 18,
    color: T.textDim,
    fontWeight: "600",
  },

  /* ── About ── */

  aboutBlock: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor:
      T.divider,
  },

  aboutHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },

  aboutLabel: {
    fontSize: 9.5,
    fontWeight: "800",
    textTransform:
      "uppercase",
    letterSpacing: 0.7,
  },

  aboutText: {
    fontSize: 13,
    lineHeight: 20,
    color: T.textDim,
    fontWeight: "500",
  },

  /* ── Newsletter ── */

  newsletterBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },

  newsletterIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  newsletterTitle: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 3,
  },

  newsletterSubtitle: {
    fontSize: 11.5,
    lineHeight: 17,
    color: T.textMuted,
    fontWeight: "500",
  },

  /* ── Error ── */

  errorBox: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor:
      "rgba(127, 29, 29, 0.3)",
    borderWidth: 1,
    borderColor:
      "rgba(251, 113, 133, 0.35)",
  },

  errorIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor:
      "rgba(251, 113, 133, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  errorTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FDA4AF",
    marginBottom: 3,
  },

  errorText: {
    fontSize: 12,
    lineHeight: 17,
    color: "#FDA4AF",
    opacity: 0.85,
    fontWeight: "500",
  },

  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor:
      "rgba(15, 23, 42, 0.7)",
    borderWidth: 1,
    borderColor:
      "rgba(251, 113, 133, 0.4)",
  },

  retryText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#FDA4AF",
    letterSpacing: 0.3,
  },

  /* ── Empty ── */

  emptyState: {
    alignItems: "center",
    paddingHorizontal: 24,
  },

  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: T.blueSoft,
    borderWidth: 1,
    borderColor:
      "rgba(96, 165, 250, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  emptyTitle: {
    fontSize: 16.5,
    fontWeight: "800",
    color: T.text,
    textAlign: "center",
    letterSpacing: -0.2,
  },

  emptyText: {
    marginTop: 8,
    fontSize: 12.5,
    lineHeight: 18,
    color: T.textMuted,
    textAlign: "center",
    maxWidth: 300,
    fontWeight: "500",
  },

  /* ── Loading ── */

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  loaderRing: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: T.blueSoft,
    borderWidth: 1,
    borderColor:
      "rgba(96, 165, 250, 0.28)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  loadingText: {
    fontSize: 15,
    color: T.text,
    fontWeight: "800",
    letterSpacing: -0.2,
  },

  loadingHint: {
    marginTop: 6,
    fontSize: 12.5,
    color: T.textMuted,
    fontWeight: "500",
  },
});