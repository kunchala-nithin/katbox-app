import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import api from "@/src/lib/api";

type MessageType = "join" | "newsletter";
type JoinRole = "customer" | "chef";
type MessageStatus = "new" | "read";

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

const getRoleLabel = (message: WebsiteMessage) => {
  if (message.type === "newsletter") {
    return "Newsletter";
  }

  return message.role === "chef"
    ? "Chef Partner"
    : "Customer";
};

export default function AllMsgsScreen() {
  const [messages, setMessages] = useState<WebsiteMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null
  );

  const loadMessages = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const response = await api.get("/api/messages/admin");
      const data = response.data;

      if (!data?.success) {
        throw new Error(data?.message || "Failed to load website messages");
      }

      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (err: any) {
      console.log(
        "❌ Failed to load website messages:",
        err?.response?.data || err?.message || err
      );

      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to load website messages."
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

  const markAsRead = useCallback(async (message: WebsiteMessage) => {
    if (message.status === "read") return;

    try {
      await api.patch(`/api/messages/admin/${message._id}/read`);

      setMessages((current) =>
        current.map((item) =>
          item._id === message._id
            ? { ...item, status: "read" }
            : item
        )
      );
    } catch (err: any) {
      console.log(
        "❌ Failed to mark website message as read:",
        err?.response?.data || err?.message || err
      );
    }
  }, []);

  const filteredMessages = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return messages;
    }

    return messages.filter((message) => {
      const haystack = [
        message.name,
        message.email,
        message.phone,
        message.city,
        message.about,
        message.role,
        message.type,
        message.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [messages, search]);

  const newCount = useMemo(
    () => messages.filter((message) => message.status === "new").length,
    [messages]
  );

  const renderMessage = ({ item }: { item: WebsiteMessage }) => {
    const expanded = selectedMessageId === item._id;
    const isNew = item.status === "new";

    return (
      <View style={styles.card}>
        <Pressable
          onPress={() => {
            setSelectedMessageId((current) =>
              current === item._id ? null : item._id
            );

            if (isNew) {
              markAsRead(item);
            }
          }}
          style={({ pressed }) => [
            styles.cardHeader,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.headerMain}>
            <View style={styles.titleRow}>
              <Text style={styles.name} numberOfLines={1}>
                {item.type === "newsletter"
                  ? item.email
                  : item.name || "Unnamed"}
              </Text>

              {isNew && <View style={styles.newDot} />}
            </View>

            <Text style={styles.meta}>
              {getRoleLabel(item)} • {formatDate(item.createdAt)}
            </Text>
          </View>

          <Text style={styles.chevron}>{expanded ? "⌃" : "⌄"}</Text>
        </Pressable>

        {expanded && (
          <View style={styles.details}>
            <View style={styles.divider} />

            <DetailRow label="Type" value={item.type} />

            {item.role && (
              <DetailRow label="Role" value={item.role} />
            )}

            {item.name && (
              <DetailRow label="Name" value={item.name} />
            )}

            <DetailRow label="Email" value={item.email} />

            {item.phone && (
              <DetailRow label="Phone" value={item.phone} />
            )}

            {item.city && (
              <DetailRow label="City" value={item.city} />
            )}

            {item.about && (
              <DetailRow label="About" value={item.about} multiline />
            )}

            <DetailRow label="Status" value={item.status} />

            {item.source && (
              <DetailRow label="Source" value={item.source} />
            )}

            <DetailRow
              label="Submitted"
              value={formatDate(item.createdAt)}
            />
          </View>
        )}
      </View>
    );
  };

  if (loading && messages.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Loading website messages...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <View style={styles.titleBlock}>
            <Text style={styles.screenTitle}>Website Messages</Text>
            <Text style={styles.screenSubtitle}>
              Customer, chef and newsletter submissions
            </Text>
          </View>

          <Pressable
            onPress={() => loadMessages(true)}
            disabled={refreshing}
            style={({ pressed }) => [
              styles.refreshButton,
              pressed && styles.pressed,
            ]}
          >
            {refreshing ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text style={styles.refreshText}>Refresh</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{messages.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{newCount}</Text>
            <Text style={styles.statLabel}>New</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {messages.filter((item) => item.type === "join").length}
            </Text>
            <Text style={styles.statLabel}>Join Forms</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {messages.filter((item) => item.type === "newsletter").length}
            </Text>
            <Text style={styles.statLabel}>Subscribers</Text>
          </View>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, email, phone, city..."
          placeholderTextColor="#8a8f98"
          autoCapitalize="none"
          style={styles.searchInput}
        />

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={() => loadMessages()}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        <FlatList
          data={filteredMessages}
          keyExtractor={(item) => String(item._id)}
          renderItem={renderMessage}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={
            filteredMessages.length === 0
              ? styles.emptyContent
              : styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadMessages(true)}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No messages found</Text>
              <Text style={styles.emptyText}>
                Website submissions will appear here automatically after a
                customer or chef submits a form.
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}

function DetailRow({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[
          styles.detailValue,
          multiline && styles.multilineValue,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f6f7f9",
  },

  container: {
    flex: 1,
    paddingHorizontal: 16,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    paddingBottom: 14,
    gap: 12,
  },

  titleBlock: {
    flex: 1,
  },

  screenTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#15171b",
  },

  screenSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: "#707680",
  },

  refreshButton: {
    minWidth: 78,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e1e4e8",
  },

  refreshText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#17191d",
  },

  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },

  statCard: {
    flex: 1,
    minHeight: 70,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    justifyContent: "center",
  },

  statNumber: {
    fontSize: 20,
    fontWeight: "800",
    color: "#17191d",
  },

  statLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "600",
    color: "#7a8089",
  },

  searchInput: {
    minHeight: 48,
    paddingHorizontal: 15,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e1e4e8",
    color: "#17191d",
    fontSize: 14,
    marginBottom: 12,
  },

  listContent: {
    paddingBottom: 28,
  },

  emptyContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 100,
  },

  card: {
    marginBottom: 10,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e3e5e9",
    overflow: "hidden",
  },

  cardHeader: {
    minHeight: 76,
    paddingHorizontal: 15,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
  },

  pressed: {
    opacity: 0.72,
  },

  headerMain: {
    flex: 1,
    minWidth: 0,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: "#17191d",
  },

  newDot: {
    width: 8,
    height: 8,
    marginLeft: 8,
    borderRadius: 99,
    backgroundColor: "#e4572e",
  },

  meta: {
    marginTop: 5,
    fontSize: 12,
    color: "#737984",
  },

  chevron: {
    marginLeft: 12,
    fontSize: 22,
    color: "#646a73",
  },

  details: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },

  divider: {
    height: 1,
    backgroundColor: "#eceef1",
    marginBottom: 6,
  },

  detailRow: {
    paddingVertical: 7,
  },

  detailLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#8a8f98",
    marginBottom: 3,
  },

  detailValue: {
    fontSize: 14,
    lineHeight: 20,
    color: "#202328",
  },

  multilineValue: {
    lineHeight: 21,
  },

  errorBox: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#fff2f0",
    borderWidth: 1,
    borderColor: "#f3c5be",
  },

  errorText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#9e3020",
  },

  retryButton: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e4b4ad",
  },

  retryText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8f2d20",
  },

  emptyState: {
    alignItems: "center",
    paddingHorizontal: 24,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#202328",
    textAlign: "center",
  },

  emptyText: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 19,
    color: "#777d86",
    textAlign: "center",
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6d727b",
  },
});
