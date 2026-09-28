import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Animated,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, usePathname } from 'expo-router'

const MENU = [
  { label: 'Add Restaurant', path: '/vendor/add-restaurant', icon: 'restaurant-outline' },
  { label: 'Add Menu Cards', path: '/vendor/add-menu', icon: 'grid-outline' },
  { label: 'Add Menu Items', path: '/vendor/add-items', icon: 'fast-food-outline' },
  { label: 'Orders Approval', path: '/vendor/orders-approval', icon: 'checkmark-done-outline' },
]

export default function VendorHeaderDropdown({ title }: { title: string }) {
  const [visible, setVisible] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(-10)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start()
    }
  }, [visible])

  const navigate = (path: string) => {
    setVisible(false)
    router.replace(path as any)
  }

  return (
    <>
      <TouchableOpacity
        style={styles.titleRow}
        activeOpacity={0.7}
        onPress={() => setVisible(true)}
      >
        <Text style={styles.title}>{title}</Text>
        <Ionicons name="chevron-down" size={18} color="#fff" style={{ marginLeft: 4 }} />
      </TouchableOpacity>

      <Modal transparent visible={visible} animationType="none">
        <Pressable style={styles.overlay} onPress={() => setVisible(false)} />

        <Animated.View
          style={[
            styles.menu,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {MENU.map(item => {
            const active = pathname === item.path

            return (
              <TouchableOpacity
                key={item.path}
                style={[styles.item, active && styles.activeItem]}
                onPress={() => navigate(item.path)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={item.icon as any}
                  size={18}
                  color={active ? '#1B5E20' : '#444'}
                />

                <Text style={[styles.itemText, active && styles.activeText]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </Animated.View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },

  menu: {
    position: 'absolute',
    top: 90,
    alignSelf: 'center',
    width: 240,
    backgroundColor: '#ffffffee',
    borderRadius: 14,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
  },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },

  itemText: {
    marginLeft: 10,
    fontSize: 15,
    color: '#333',
  },

  activeItem: {
    backgroundColor: '#E8F5E9',
  },

  activeText: {
    color: '#1B5E20',
    fontWeight: '600',
  },
})
