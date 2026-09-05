import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
  Dimensions,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Alert,
  Modal,
  Animated,
  Platform,
  UIManager,
  LayoutAnimation,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { BlurView } from 'expo-blur'
import api from "@/src/lib/api"

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width, height } = Dimensions.get('window')

const DEFAULT_WEEKLY_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

const ChevronLeft = ({ size = 22, color = '#0B261D' }) => (
  <Feather name="chevron-left" size={size} color={color} />
)

const FALLBACK_HERO_IMAGE = {
  uri: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800',
}
const LUNCH_IMAGE = {
  uri: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400',
}
const DINNER_IMAGE = {
  uri: 'https://images.unsplash.com/photo-1574653853027-5382a3d23a15?w=400',
}

const FOOD_THUMB = { uri: 'https://via.placeholder.com/80?text=Food' }

interface FlexibleDayParam {
  dayName: string;
  dayNumber: string;
  monthName: string;
  fullDateString: string;
}

const getOrdinalSuffix = (dayNum: number): string => {
  if (dayNum > 3 && dayNum < 21) return 'th';
  switch (dayNum % 10) {
    case 1:  return 'st';
    case 2:  return 'nd';
    case 3:  return 'rd';
    default: return 'th';
  }
};

const formatReadableDate = (dateStr?: string, fallbackDay = 'Mon'): string => {
  if (!dateStr) {
    return fallbackDay;
  }
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const monthIndex = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const suffix = getOrdinalSuffix(day);
    return `${day}${suffix} ${monthNames[monthIndex] || ''}`;
  }
  return dateStr;
};

const MealBoxItems = () => {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const routeParams = useLocalSearchParams()
  const [selectedDay, setSelectedDay] = useState('Mon')
  const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false)
  const [modalActiveDay, setModalActiveDay] = useState('Mon')

  const scrollY = useRef(new Animated.Value(0)).current
  const [collapsedMeals, setCollapsedMeals] = useState<Record<string, boolean>>({})

  const toggleMealCollapse = (mealTime: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setCollapsedMeals((prev) => ({
      ...prev,
      [mealTime]: !prev[mealTime],
    }))
  }

  const { 
    planId, 
    planName, 
    planPrice, 
    originalBasePrice, 
    description, 
    mealsPerDay, 
    mealsPerWeek, 
    category, 
    planImage, 
    chefId,
    chefName,
    userId,
    userName,
    returnSelectedSelections, 
    returnAddonQuantities,
    selectedDurationType,
    chosenFlexibleDates,
    returnPlanPrice
  } = routeParams

  const effectiveChefId = (chefId as string) || (routeParams.id as string) || ""
  const effectiveChefName = (chefName as string) || ""
  const effectiveUserId = (userId as string) || ""
  const effectiveUserName = (userName as string) || ""

  let activeDaysToRender = DEFAULT_WEEKLY_DAYS
  let flexibleDaysMap: Record<string, string> = {}

  if (chosenFlexibleDates) {
    try {
      const parsedFlexDates: FlexibleDayParam[] = JSON.parse(chosenFlexibleDates as string)
      if (Array.isArray(parsedFlexDates) && parsedFlexDates.length > 0) {
        activeDaysToRender = parsedFlexDates.map(d => d.dayName)
        parsedFlexDates.forEach(d => {
          flexibleDaysMap[d.dayName] = d.fullDateString
        })
      }
    } catch (e) {
      console.log("Error parsing flexible dates data:", e)
    }
  }

  useEffect(() => {
    if (activeDaysToRender.length > 0 && !activeDaysToRender.includes(selectedDay)) {
      setSelectedDay(activeDaysToRender[0])
    }
  }, [chosenFlexibleDates, selectedDurationType])

  const displayPlanName = (planName as string) || "Classic Plan"
  
  const baselinePriceSource = (originalBasePrice as string) || (planPrice as string) || "899"
  const rawBasePrice = parseInt(baselinePriceSource.replace(/[^0-9]/g, ''), 10) || 899

  let processedBasePlanPrice = rawBasePrice
  if (selectedDurationType === "Flexible Days") {
    const standardDayRate = rawBasePrice / 5
    if (activeDaysToRender.length < 5) {
      const flexiblePremiumRate = standardDayRate * 1.15
      processedBasePlanPrice = Math.round(flexiblePremiumRate * activeDaysToRender.length)
    } else {
      processedBasePlanPrice = Math.round(standardDayRate * activeDaysToRender.length)
    }
  } else if (selectedDurationType === "Single Meal") {
    processedBasePlanPrice = Math.round((rawBasePrice / 5) * 1.35)
  }

  const basePlanDisplayCost = returnPlanPrice ? parseInt(returnPlanPrice as string, 10) : processedBasePlanPrice;
  const displayPlanPrice = `₹${basePlanDisplayCost}`
  
  const displayDescription = (description as string) || "Perfect balance of taste & nutrition for everyday meals."
  const displayMealsPerDay = (mealsPerDay as string) || "2 Meals / Day"
  
  const displayMealsPerWeek = selectedDurationType === "Flexible Days" 
    ? `${activeDaysToRender.length} Days Custom Plan` 
    : (selectedDurationType === "Single Meal" ? "1 Day Sample Box" : (mealsPerWeek as string) || "20 Meals / Week")

  const displayCategory = (category as string) || "Lunch + Dinner"
  
  const displayHeroImage = planImage ? { uri: planImage as string } : FALLBACK_HERO_IMAGE

  const [remoteMealBoxData, setRemoteMealBoxData] = useState<any>(null)
  const [loadingItems, setLoadingItems] = useState(true)

  const [selectedSelections, setSelectedSelections] = useState<Record<string, string | boolean>>({})
  const [addonQuantities, setAddonQuantities] = useState<Record<string, number>>({})

  useEffect(() => {
    const fetchPlanDetailsWithItems = async () => {
      if (!effectiveChefId) return
      try {
        const res = await api.get(`/api/chef-categories/plans/chef/${effectiveChefId}`)
        if (res.data && Array.isArray(res.data)) {
          const matchingPlan = res.data.find((p: any) => p._id === planId || p.id === planId)
          if (matchingPlan && matchingPlan.mealBoxData) {
            const parsedData = typeof matchingPlan.mealBoxData === 'string' 
              ? JSON.parse(matchingPlan.mealBoxData) 
              : matchingPlan.mealBoxData
            setRemoteMealBoxData(parsedData)
            
            if (returnSelectedSelections || returnAddonQuantities) {
              if (returnSelectedSelections) {
                try {
                  setSelectedSelections(JSON.parse(returnSelectedSelections as string))
                } catch (e) {
                  console.log("Error parsing returnSelectedSelections", e)
                }
              }
              if (returnAddonQuantities) {
                try {
                  setAddonQuantities(JSON.parse(returnAddonQuantities as string))
                } catch (e) {
                  console.log("Error parsing returnAddonQuantities", e)
                }
              }
            } else {
              const startDay = activeDaysToRender.length > 0 ? activeDaysToRender[0] : 'Mon'
              initializeDayDefaults(parsedData, startDay)
            }
          }
        }
      } catch (err) {
        console.log("Error loading dynamic items configuration map context inside customer view:", err)
      } finally {
        setLoadingItems(false)
      }
    }
    fetchPlanDetailsWithItems()
  }, [planId, effectiveChefId, returnSelectedSelections, returnAddonQuantities])

  const initializeDayDefaults = (data: any, day: string) => {
    const dataLookupKey = day === 'Today' ? 'Mon' : day
    if (!data || !data[dataLookupKey]) return
    const dayPayload = data[dataLookupKey]
    const defaultSelections: Record<string, string | boolean> = {}
    const defaultAddons: Record<string, number> = {}

    const targetMeals = (displayCategory === "Lunch") ? ["Lunch"] : (displayCategory === "Dinner" ? ["Dinner"] : ["Lunch", "Dinner"])

    targetMeals.forEach((mealTime) => {
      const sections = dayPayload[mealTime] || {}
      Object.keys(sections).forEach((sectionKey) => {
        const wrapper = sections[sectionKey] || {}
        const items = Array.isArray(wrapper.items) ? wrapper.items : (Array.isArray(wrapper) ? wrapper : [])
        const activeItems = items.filter((i: any) => i.active !== false)
        
        if (activeItems.length > 0) {
          const defaultBaseItem = activeItems.find((i: any) => !i.price || i.price === 0) || activeItems[0]
          if (selectedSelections[`${mealTime}_${sectionKey}`] === undefined) {
            defaultSelections[`${mealTime}_${sectionKey}`] = defaultBaseItem.id
          }
          
          activeItems.forEach((itm: any) => {
            if (addonQuantities[itm.id] === undefined) {
              defaultAddons[itm.id] = 0
            } else {
              defaultAddons[itm.id] = addonQuantities[itm.id]
            }
          })
        }
      })
    })

    setSelectedSelections(prev => ({ ...defaultSelections, ...prev }))
    setAddonQuantities(prev => ({ ...defaultAddons, ...prev }))
  }

  const handleBackPress = () => {
    router.push({
      pathname: "/screens/MealBoxPlans",
      params: {
        id: effectiveChefId,
        chefId: effectiveChefId,
        chefName: effectiveChefName,
        userId: effectiveUserId,
        userName: effectiveUserName,
        location: routeParams.location || "",
        chefImage: routeParams.chefImage || "",
        avatar: routeParams.avatar || "",
        rating: routeParams.rating || "",
        fromCategory: "Meal Box",
      },
    })
  }

  const handleDayChange = (day: string) => {
    setSelectedDay(day)
    if (remoteMealBoxData) {
      initializeDayDefaults(remoteMealBoxData, day)
    }
  }

  const headerOpacity = scrollY.interpolate({
    inputRange: [200, 280],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })

  const headerTranslateY = scrollY.interpolate({
    inputRange: [200, 280],
    outputRange: [-30, 0],
    extrapolate: 'clamp',
  })

  const heroImageTranslateY = scrollY.interpolate({
    inputRange: [-100, 0, 250],
    outputRange: [-50, 0, 80],
    extrapolate: 'clamp',
  })

  const heroImageScale = scrollY.interpolate({
    inputRange: [-150, 0],
    outputRange: [1.35, 1],
    extrapolateRight: 'clamp',
  })

  const isSingleDay = activeDaysToRender.length === 1
  const isSingleMealBox = selectedDurationType === "Single Meal"

  const renderDayTabs = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.dayTabsScroll, isSingleDay && { flexGrow: 0 }]}
    >
      <View style={[styles.dayTabs, isSingleDay && styles.dayTabsSingle]}>
        {activeDaysToRender.map((day, dIdx) => {
          const isSelected = selectedDay === day
          const correspondingDateStr = flexibleDaysMap[day]
          const formattedDateOnly = formatReadableDate(correspondingDateStr, day)

          const displayLabel = isSelected && correspondingDateStr
            ? `${day} • ${formattedDateOnly}`
            : day

          return (
            <TouchableOpacity
              key={`${day}-${dIdx}`}
              style={[
                styles.dayTab,
                isSelected && styles.dayTabActive,
                isSelected && correspondingDateStr ? styles.dayTabActiveExpanded : null,
                isSingleDay && styles.dayTabSingleItem,
              ]}
              onPress={() => handleDayChange(day)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.dayTabText,
                  isSelected && styles.dayTabTextActive,
                ]}
                numberOfLines={1}
              >
                {displayLabel}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </ScrollView>
  )

  const lookupDayKey = selectedDay === 'Today' ? 'Mon' : selectedDay
  const currentDayPayload = remoteMealBoxData ? remoteMealBoxData[lookupDayKey] : null

  const billBreakdownItems: Array<{ name: string; qty: number; totalCost: number }> = []
  if (remoteMealBoxData) {
    activeDaysToRender.forEach((day) => {
      const structuralKey = day === 'Today' ? 'Mon' : day
      const dayData = remoteMealBoxData[structuralKey]
      if (!dayData) return

      const targetMeals = (displayCategory === "Lunch") ? ["Lunch"] : (displayCategory === "Dinner" ? ["Dinner"] : ["Lunch", "Dinner"])
      targetMeals.forEach((mealTime) => {
        const sections = dayData[mealTime] || {}
        Object.keys(sections).forEach((sectionKey) => {
          const sectionWrapper = sections[sectionKey] || {}
          const rawItems = Array.isArray(sectionWrapper.items) ? sectionWrapper.items : (Array.isArray(sectionWrapper) ? sectionWrapper : [])
          const activeItemsList = rawItems.filter((i: any) => i.active !== false)

          activeItemsList.forEach((item: any) => {
            const qty = addonQuantities[item.id] || 0
            const itemPrice = item.price && Number(item.price) > 0 ? Number(item.price) : 0
            if (qty > 0 && itemPrice > 0) {
              const existingBreakdown = billBreakdownItems.find(b => b.name === item.name)
              if (existingBreakdown) {
                existingBreakdown.qty += qty
                existingBreakdown.totalCost += (qty * itemPrice)
              } else {
                billBreakdownItems.push({
                  name: item.name,
                  qty: qty,
                  totalCost: qty * itemPrice
                })
              }
            }
          })
        })
      })
    })
  }

  const totalExtraAddonsCost = billBreakdownItems.reduce((acc, curr) => acc + curr.totalCost, 0)
  const computedWeeklyTotalPrice = basePlanDisplayCost + totalExtraAddonsCost;

  const getDynamicFooterUnitLabel = () => {
    if (selectedDurationType === "Weekly Plan" || activeDaysToRender.length === 6) {
      return "/ week total"
    }
    if (selectedDurationType === "Single Meal") {
      return "/ box total"
    }
    return `/ ${activeDaysToRender.length} days total`
  }

  const getAllDaysSelectionsSummary = () => {
    const fullWeekSummary: Record<string, Array<{ meal: string; section: string; name: string; image: string; type: 'included' | 'addon'; qty?: number }>> = {}
    
    if (!remoteMealBoxData) return fullWeekSummary

    activeDaysToRender.forEach((day) => {
      fullWeekSummary[day] = []
      const structuralKey = day === 'Today' ? 'Mon' : day
      const dayData = remoteMealBoxData[structuralKey]
      if (!dayData) return

      const targetMeals = (displayCategory === "Lunch") ? ["Lunch"] : (displayCategory === "Dinner" ? ["Dinner"] : ["Lunch", "Dinner"])
      
      targetMeals.forEach((mealTime) => {
        const sections = dayData[mealTime] || {}
        Object.keys(sections).forEach((sectionKey) => {
          const sectionWrapper = sections[sectionKey] || {}
          const maxSelectable = typeof sectionWrapper.maxItems === "number" ? sectionWrapper.maxItems : 1
          const rawItems = Array.isArray(sectionWrapper.items) ? sectionWrapper.items : (Array.isArray(sectionWrapper) ? sectionWrapper : [])
          const activeItemsList = rawItems.filter((i: any) => i.active !== false)

          const cleanKey = sectionKey.toLowerCase()
          const isAddonOrExtrasCategory = cleanKey.includes("add on") || cleanKey.includes("addon") || cleanKey.includes("extra")

          activeItemsList.forEach((item: any) => {
            const selectionKey = `${mealTime}_${sectionKey}`
            const isPricedItem = item.price && Number(item.price) > 0
            
            if (isPricedItem || isAddonOrExtrasCategory) {
              const qty = addonQuantities[item.id] || 0
              if (qty > 0) {
                fullWeekSummary[day].push({
                  meal: mealTime,
                  section: sectionKey,
                  name: item.name,
                  image: item.image,
                  type: 'addon',
                  qty: qty
                })
              }
            } else {
              const isRadioSelected = selectedSelections[selectionKey] === item.id
              const isMultiSelected = selectedSelections[`${selectionKey}_${item.id}`] === true
              
              if ((maxSelectable === 1 && isRadioSelected) || (maxSelectable > 1 && isMultiSelected)) {
                fullWeekSummary[day].push({
                  meal: mealTime,
                  section: sectionKey,
                  name: item.name,
                  image: item.image,
                  type: 'included'
                })
              }
            }
          })
        })
      })
    })
    return fullWeekSummary
  }

  const weeklyFullSelections = getAllDaysSelectionsSummary()

  const handleOpenPreviewModal = () => {
    setModalActiveDay(selectedDay)
    setIsPreviewModalVisible(true)
  }

  const groupSelectionsBySectionCategory = (flatItemsList: any[]) => {
    const categoriesMap: Record<string, any[]> = {}
    flatItemsList.forEach((item) => {
      if (!categoriesMap[item.section]) {
        categoriesMap[item.section] = []
      }
      categoriesMap[item.section].push(item)
    })
    return categoriesMap
  }

  const handleConfirmAndSubscribe = () => {
    setIsPreviewModalVisible(false)
    
    router.push({
      pathname: '/screens/MealBoxOrderReview',
      params: {
        planId,
        planName: displayPlanName,
        planPrice: String(computedWeeklyTotalPrice),
        originalBasePrice: String(basePlanDisplayCost),
        description: displayDescription,
        mealsPerDay: displayMealsPerDay,
        mealsPerWeek: displayMealsPerWeek,
        category: displayCategory,
        planImage: routeParams.planImage || '',
        chefId: effectiveChefId,
        chefName: effectiveChefName,
        userId: effectiveUserId,
        userName: effectiveUserName,
        location: routeParams.location || '',
        chefImage: routeParams.chefImage || '',
        avatar: routeParams.avatar || '',
        rating: routeParams.rating || '',
        selectedSelections: JSON.stringify(selectedSelections),
        addonQuantities: JSON.stringify(addonQuantities),
        weeklySelections: JSON.stringify(weeklyFullSelections),
        selectedDurationType: selectedDurationType,
        chosenFlexibleDates: chosenFlexibleDates,
      },
    })
  }

  return (
    <SafeAreaView style={styles.safe} edges={['right', 'bottom', 'left']}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <Animated.View 
        style={[
          styles.compactStickyHeader, 
          { 
            paddingTop: Math.max(insets.top, 16) + 8,
            opacity: headerOpacity,
            transform: [{ translateY: headerTranslateY }]
          }
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.titleRowCompact}>
          <TouchableOpacity style={styles.compactBackBtn} onPress={handleBackPress} activeOpacity={0.75}>
            <ChevronLeft size={20} color="#0B261D" />
          </TouchableOpacity>
          <View style={styles.centerTitleWrapper}>
            <Text style={styles.planTitleCompact} numberOfLines={1}>{displayPlanName}</Text>
          </View>
          <View style={styles.compactBackBtnPlaceholder} />
        </View>
        <View style={styles.statsRowCompact}>
          <View style={styles.statItemCompact}>
            <Feather name="clock" size={13} color="#0F382A" />
            <Text style={styles.statValueCompact}>{displayMealsPerDay}</Text>
          </View>
          <View style={styles.statItemCompact}>
            <Feather name="calendar" size={13} color="#0F382A" />
            <Text style={styles.statValueCompact}>{displayMealsPerWeek}</Text>
          </View>
          <View style={styles.statItemCompact}>
            <Feather name="credit-card" size={13} color="#0F382A" />
            <Text style={styles.statValueCompact}>₹{computedWeeklyTotalPrice}</Text>
          </View>
        </View>
      </Animated.View>

      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
      >
        <View style={styles.heroContainer}>
          <Animated.Image 
            source={displayHeroImage} 
            style={[
              styles.heroImage,
              {
                transform: [
                  { translateY: heroImageTranslateY },
                  { scale: heroImageScale }
                ]
              }
            ]} 
            resizeMode="cover" 
          />
          <TouchableOpacity 
            style={[styles.floatingImageBackBtn, { top: Math.max(insets.top, 16) + 8 }]}
            onPress={handleBackPress}
            activeOpacity={0.8}
          >
            <View style={styles.backBtnCircle}>
              <ChevronLeft size={22} color="#0D2E22" />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.mainCardView}>
          <View style={styles.titleRow}>
            <Text style={styles.planTitle} numberOfLines={1}>{displayPlanName}</Text>
            <View style={styles.popularBadge}>
              <Feather name="star" size={10} color="#0F382A" style={{ marginRight: 4 }} />
              <Text style={styles.popularText}>CUSTOM PLAN</Text>
            </View>
          </View>

          <Text style={styles.planSubtitle}>
            {displayDescription}
          </Text>

          <View style={styles.summaryContainerBox}>
            <View style={styles.summaryColumn}>
              <View style={styles.summaryIconCircle}>
                <Feather name="clock" size={14} color="#0F382A" />
              </View>
              <Text style={styles.summaryValueText}>{displayMealsPerDay}</Text>
              <Text style={styles.summaryLabelText}>{displayCategory}</Text>
            </View>
            <View style={styles.summaryDividerLine} />
            <View style={styles.summaryColumn}>
              <View style={styles.summaryIconCircle}>
                <Feather name="calendar" size={14} color="#0F382A" />
              </View>
              <Text style={styles.summaryValueText}>{displayMealsPerWeek}</Text>
              <Text style={styles.summaryLabelText}>{selectedDurationType || "Custom Schedule"}</Text>
            </View>
            <View style={styles.summaryDividerLine} />
            <View style={styles.summaryColumn}>
              <View style={styles.summaryIconCircle}>
                <Feather name="credit-card" size={14} color="#0F382A" />
              </View>
              <Text style={styles.summaryValueText}>{displayPlanPrice}</Text>
              <Text style={styles.summaryLabelText}>Base Plan Cost</Text>
            </View>
          </View>

          <View style={styles.featuresRow}>
            <View style={styles.featureItem}>
              <Feather name="percent" size={13} color="#0F382A" />
              <Text style={styles.featureTitle}>Customizable</Text>
            </View>
            <View style={styles.featureItem}>
              <Feather name="refresh-cw" size={13} color="#0F382A" />
              <Text style={styles.featureTitle}>Flexible Routine</Text>
            </View>
            <View style={styles.featureItem}>
              <Feather name="truck" size={13} color="#0F382A" />
              <Text style={styles.featureTitle}>Free Delivery</Text>
            </View>
          </View>

          <View style={styles.sampleMenuHeader}>
            <Text style={styles.sampleMenuTitle}>Customize Daily Choices</Text>
            <Text style={styles.sampleMenuSubtitle}>Tailor dishes and extras for each scheduled delivery day</Text>
          </View>
        </View>

        <View style={styles.menuScrollableContainer}>
          {loadingItems ? (
            <ActivityIndicator size="small" color="#166534" style={{ marginVertical: 36 }} />
          ) : !currentDayPayload ? (
            <Text style={styles.emptyText}>No selection data found for this setup configuration.</Text>
          ) : (
            (displayCategory === "Lunch" ? ["Lunch"] : displayCategory === "Dinner" ? ["Dinner"] : ["Lunch", "Dinner"]).map((mealTime, mIdx) => {
              const sections = currentDayPayload[mealTime] || {}
              const mealBannerImage = mealTime === "Lunch" ? LUNCH_IMAGE : DINNER_IMAGE

              const activeDayDateStr = flexibleDaysMap[selectedDay]
              const headerFormattedDate = activeDayDateStr
                ? `${selectedDay} • ${formatReadableDate(activeDayDateStr, selectedDay)}`
                : selectedDay

              const isMealCollapsed = collapsedMeals[mealTime] === true

              return (
                <View key={mealTime} style={{ marginBottom: 20 }}>
                  <View style={styles.unifiedDayAndMealCard}>
                    {/* 1. Lunch / Dinner Collapsible Header */}
                    <TouchableOpacity 
                      style={styles.integratedMealSubRow}
                      activeOpacity={0.8}
                      onPress={() => toggleMealCollapse(mealTime)}
                    >
                      <View style={styles.integratedMealTextLeft}>
                        <View style={styles.mealTitleWithIcon}>
                          <View style={styles.mealBadgeDot} />
                          <Text style={styles.customMealTypeLabel}>{mealTime} Courses</Text>
                          <Feather 
                            name={isMealCollapsed ? "chevron-down" : "chevron-up"} 
                            size={18} 
                            color="#0B261D" 
                            style={{ marginLeft: 4 }} 
                          />
                        </View>
                        <Text style={styles.mealActionSubtitle}>
                          Customise {headerFormattedDate}'s courses & sides
                        </Text>
                      </View>
                      <Image source={mealBannerImage} style={styles.bannerMealImage} resizeMode="cover" />
                    </TouchableOpacity>

                    {/* 2. Divider Line */}
                    {mIdx === 0 && <View style={styles.integratedDividerLine} />}

                    {/* 3. Date & Day Selector below */}
                    {mIdx === 0 && (
                      <View style={styles.integratedDaySelectorRow}>
                        {isSingleMealBox && (
                          <View style={styles.integratedDayBadge}>
                            <Feather name="calendar" size={13} color="#0F382A" style={{ marginRight: 6 }} />
                            <Text style={styles.integratedDayBadgeText}>DATE</Text>
                          </View>
                        )}
                        <View style={[styles.embeddedDayTabsWrapper, isSingleDay && { flex: 0 }]}>
                          {renderDayTabs()}
                        </View>
                      </View>
                    )}
                  </View>

                  {!isMealCollapsed && Object.keys(sections).map((sectionKey, secIdx) => {
                    const sectionWrapper = sections[sectionKey] || {}
                    const maxSelectable = typeof sectionWrapper.maxItems === "number" ? sectionWrapper.maxItems : 1
                    const rawItems = Array.isArray(sectionWrapper.items) ? sectionWrapper.items : (Array.isArray(sectionWrapper) ? sectionWrapper : [])
                    const activeItemsList = rawItems.filter((i: any) => i.active !== false)

                    if (activeItemsList.length === 0) return null

                    const cleanKey = sectionKey.toLowerCase()
                    const isAddonOrExtrasCategory = 
                      cleanKey.includes("add on") || 
                      cleanKey.includes("addon") || 
                      cleanKey.includes("extra")

                    return (
                      <View key={sectionKey} style={styles.customizationBox}>
                        <View style={styles.headerStepContainer}>
                          <Text style={styles.sectionStepTitle}>{sectionKey}</Text>
                          {!isAddonOrExtrasCategory && (
                            <View style={styles.badgeContainer}>
                              <Text style={styles.requirementBadgeText}>Choose {maxSelectable}</Text>
                            </View>
                          )}
                        </View>

                        {activeItemsList.map((item: any, idx: number) => {
                          const selectionKey = `${mealTime}_${sectionKey}`
                          const isSelected = selectedSelections[selectionKey] === item.id
                          const currentQty = addonQuantities[item.id] || 0
                          const isPricedItem = item.price && Number(item.price) > 0
                          const shouldRenderCounterControl = isPricedItem || isAddonOrExtrasCategory
                          const isRadioActive = (maxSelectable === 1 && isSelected) || (maxSelectable > 1 && selectedSelections[`${selectionKey}_${item.id}`] === true)

                          return (
                            <View key={item.id || item._id || String(idx)}>
                              <View style={[styles.interactiveRow, isRadioActive && styles.interactiveRowActive]}>
                                <View style={styles.foodItemLeft}>
                                  <Image source={item.image ? { uri: item.image } : FOOD_THUMB} style={styles.circularFoodThumb} />
                                  <View style={{ flex: 1 }}>
                                    <Text style={[styles.foodItemName, isRadioActive && styles.foodItemNameActive]}>{item.name}</Text>
                                    {isPricedItem ? (
                                      <Text style={styles.addonPriceText}>+ ₹{item.price} / Box</Text>
                                    ) : (
                                      <Text style={styles.includedText}>Included with Plan</Text>
                                    )}
                                  </View>
                                </View>

                                {shouldRenderCounterControl ? (
                                  <View style={styles.counterControlWrapper}>
                                    <TouchableOpacity 
                                      style={styles.counterActionBtn} 
                                      onPress={() => setAddonQuantities(prev => ({ ...prev, [item.id]: Math.max(0, currentQty - 1) }))}
                                      activeOpacity={0.75}
                                    >
                                      <Feather name="minus" size={13} color="#0F382A" />
                                    </TouchableOpacity>
                                    <Text style={[styles.counterValueDisplay, currentQty > 0 && styles.counterValueActive]}>
                                      {currentQty}
                                    </Text>
                                    <TouchableOpacity 
                                      style={styles.counterActionBtn} 
                                      activeOpacity={0.75}
                                      onPress={() => {
                                        if (isAddonOrExtrasCategory) {
                                          setAddonQuantities(prev => ({ ...prev, [item.id]: currentQty + 1 }))
                                        } else {
                                          const currentSectionTotal = activeItemsList.reduce((acc: number, cur: any) => acc + (addonQuantities[cur.id] || 0), 0)
                                          if (maxSelectable === 1) {
                                            const resetQuantities = { ...addonQuantities }
                                            activeItemsList.forEach((itm: any) => { resetQuantities[itm.id] = 0 })
                                            resetQuantities[item.id] = 1
                                            setAddonQuantities(resetQuantities)
                                          } else if (currentSectionTotal < maxSelectable) {
                                            setAddonQuantities(prev => ({ ...prev, [item.id]: currentQty + 1 }))
                                          } else {
                                            Alert.alert("Limit Reached", `Maximum configuration bounds limit reached.`)
                                          }
                                        }
                                      }}
                                    >
                                      <Feather name="plus" size={13} color="#0F382A" />
                                    </TouchableOpacity>
                                  </View>
                                ) : (
                                  <TouchableOpacity 
                                    style={[styles.radioCircle, isRadioActive && styles.radioCircleActive]} 
                                    activeOpacity={0.8}
                                    onPress={() => {
                                      if (maxSelectable === 1) {
                                        setSelectedSelections(prev => ({ ...prev, [selectionKey]: item.id }))
                                      } else {
                                        const totalSelectedRadios = activeItemsList.filter((i: any) => selectedSelections[`${selectionKey}_${i.id}`] === true).length
                                        const itemToggleKey = `${selectionKey}_${item.id}`
                                        
                                        if (selectedSelections[itemToggleKey]) {
                                          setSelectedSelections(prev => ({ ...prev, [itemToggleKey]: false }))
                                        } else if (totalSelectedRadios < maxSelectable) {
                                          setSelectedSelections(prev => ({ ...prev, [itemToggleKey]: true }))
                                        } else {
                                          Alert.alert("Limit Reached", `You can choose a maximum of ${maxSelectable} items here.`)
                                        }
                                      }
                                    }}
                                  >
                                    {isRadioActive && (
                                      <View style={styles.radioInnerDot} />
                                    )}
                                  </TouchableOpacity>
                                )}
                              </View>
                              {idx < activeItemsList.length - 1 && <View style={styles.innerRowDivider} />}
                            </View>
                          );
                        })}
                      </View>
                    )
                  })}
                </View>
              )
            })
          )}
        </View>
      </Animated.ScrollView>

      {/* Sticky Bottom Footer View */}
      <View style={styles.footer}>
        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownHeaderTitle}>Cost Breakdown</Text>
          <View style={styles.breakdownItemRow}>
            <Text style={styles.breakdownLabelText}>Scheduled Base Plan</Text>
            <Text style={styles.breakdownValueText}>₹{basePlanDisplayCost}</Text>
          </View>
          
          {billBreakdownItems.map((breakdownItem, itemIdx) => (
            <View key={itemIdx} style={styles.breakdownItemRow}>
              <Text style={styles.breakdownLabelText}>
                {breakdownItem.name} <Text style={styles.breakdownQtyDimText}>× {breakdownItem.qty}</Text>
              </Text>
              <Text style={styles.breakdownValueText}>+ ₹{breakdownItem.totalCost}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footerMainActionBlock}>
          <View style={styles.footerPriceBlock}>
            <Text style={styles.footerPrice}>
              ₹{computedWeeklyTotalPrice}
            </Text>
            <Text style={styles.footerPriceUnit}>{getDynamicFooterUnitLabel()}</Text>
          </View>
          <TouchableOpacity 
            style={styles.choosePlanBtn} 
            activeOpacity={0.88}
            onPress={handleOpenPreviewModal}
          >
            <Text style={styles.choosePlanText}>Preview Order</Text>
            <Feather name="eye" size={15} color="#FAF8F5" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Preview Modal Bottom Sheet with BlurView */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isPreviewModalVisible}
        onRequestClose={() => setIsPreviewModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
          
          <TouchableOpacity 
            style={styles.modalDismissTapArea} 
            activeOpacity={1} 
            onPress={() => setIsPreviewModalVisible(false)}
          />
          <View style={[styles.modalBottomSheetContainer, { height: height * 0.82, paddingBottom: Math.max(insets.bottom, 20) }]}>
            <TouchableOpacity 
              style={styles.modalClosePillButton} 
              onPress={() => setIsPreviewModalVisible(false)}
              activeOpacity={0.85}
            >
              <Feather name="x" size={20} color="#FAF8F5" />
            </TouchableOpacity>

            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalHeaderTitle}>Selected Schedule Summary</Text>
                <Text style={styles.modalHeaderSubtitle}>Review your course selections for each delivery day</Text>
              </View>
            </View>

            <View style={[styles.modalPillContainer, isSingleDay && styles.modalPillContainerSingle]}>
              {activeDaysToRender.map((day, dIdx) => {
                const dayCount = (weeklyFullSelections[day] || []).length
                const isDaySelected = modalActiveDay === day
                const correspondingDateStr = flexibleDaysMap[day]
                const formattedDateText = correspondingDateStr 
                  ? `${day} • ${formatReadableDate(correspondingDateStr, day)}` 
                  : day

                return (
                  <TouchableOpacity
                    key={`${day}-modal-${dIdx}`}
                    style={[
                      styles.modalPillItem,
                      isSingleDay && styles.modalPillItemSingle,
                      isDaySelected && styles.modalPillItemActive
                    ]}
                    onPress={() => setModalActiveDay(day)}
                    activeOpacity={0.8}
                  >
                    <Text style={[
                      styles.modalPillText,
                      isDaySelected && styles.modalPillTextActive
                    ]}>
                      {formattedDateText}
                    </Text>
                    {dayCount > 0 && (
                      <View style={[
                        styles.modalPillCounter,
                        isDaySelected && styles.modalPillCounterActive
                      ]}>
                        <Text style={[
                          styles.modalPillCounterText,
                          isDaySelected && styles.modalPillCounterTextActive
                        ]}>
                          {dayCount}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>

            <ScrollView 
              style={styles.modalScrollView} 
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalDaySectionBox}>
                <View style={styles.modalDayHeaderStrip}>
                  <Text style={styles.modalDayTitleText}>
                    {flexibleDaysMap[modalActiveDay] ? `${modalActiveDay} • ${formatReadableDate(flexibleDaysMap[modalActiveDay], modalActiveDay)}` : modalActiveDay} Menu Selections
                  </Text>
                </View>
                
                {(!weeklyFullSelections[modalActiveDay] || weeklyFullSelections[modalActiveDay].length === 0) ? (
                  <Text style={styles.modalEmptyDayText}>No active options customized for this day.</Text>
                ) : (
                  Object.entries(groupSelectionsBySectionCategory(weeklyFullSelections[modalActiveDay])).map(([categoryHeading, selectedItemsGroup], groupIdx) => (
                    <View key={categoryHeading} style={[styles.modalCategoryGroupBlock, groupIdx > 0 && { marginTop: 14 }]}>
                      <View style={styles.modalCategorySectionHeadingBadge}>
                        <Text style={styles.modalCategorySectionHeadingText}>{categoryHeading}</Text>
                      </View>
                      
                      {selectedItemsGroup.map((item, keyIdx) => (
                        <View key={keyIdx} style={styles.modalSelectionRowItem}>
                          <View style={styles.modalSelectionLeftInfo}>
                            <Image 
                              source={item.image ? { uri: item.image } : FOOD_THUMB} 
                              style={styles.modalCircularFoodThumb} 
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.modalItemNameText}>{item.name}</Text>
                            </View>
                          </View>
                          
                          <View style={styles.modalRightBadgeWrapper}>
                            {item.type === 'addon' ? (
                              <View style={styles.modalAddonPillBadge}>
                                <Text style={styles.modalAddonBadgeText}>Extra ×{item.qty}</Text>
                              </View>
                            ) : (
                              <View style={styles.modalIncludedPillBadge}>
                                <Feather name="check-circle" size={12} color="#107C41" style={{ marginRight: 4 }} />
                                <Text style={styles.modalIncludedBadgeText}>Included</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  ))
                )}
              </View>
            </ScrollView>

            <View style={styles.modalFooterActionButtonBlock}>
              <TouchableOpacity 
                style={styles.modalFinalSubmitBtn}
                onPress={handleConfirmAndSubscribe}
                activeOpacity={0.88}
              >
                <Text style={styles.modalFinalSubmitText}>Confirm & Subscribe • ₹{computedWeeklyTotalPrice}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

export default MealBoxItems

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  compactStickyHeader: {
    position: 'absolute',
    top: 0, 
    left: 0,
    right: 0,
    backgroundColor: '#FAF8F5',
    paddingHorizontal: 16,
    paddingBottom: 0,
    zIndex: 100,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 56, 42, 0.08)',
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  titleRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    width: '100%',
  },
  compactBackBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  centerTitleWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTitleCompact: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0B261D',
    letterSpacing: -0.3,
  },
  compactBackBtnPlaceholder: {
    width: 32,
  },
  statsRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 0,
  },
  statItemCompact: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    gap: 6,
  },
  statValueCompact: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0B261D',
  },
  scroll: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  heroContainer: {
    position: 'relative',
    width: '100%',
    height: 270,
    backgroundColor: '#E5ECE8',
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%', 
  },
  floatingImageBackBtn: {
    position: 'absolute',
    left: 18,
    zIndex: 10,
  },
  backBtnCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.12)',
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  mainCardView: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    paddingHorizontal: 20,
    paddingTop: 24,
    backgroundColor: '#FAF8F5',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  planTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0B261D',
    letterSpacing: -0.5,
    flex: 1,
    marginRight: 12,
  },
  popularBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 56, 42, 0.08)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.15)',
  },
  popularText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F382A',
    letterSpacing: 0.6,
  },
  planSubtitle: {
    fontSize: 13,
    color: '#5B756C',
    lineHeight: 18,
    marginBottom: 18,
    fontWeight: '500',
  },
  summaryContainerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 6,
    marginBottom: 18,
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(15, 56, 42, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
  },
  summaryValueText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0B261D',
    textAlign: 'center',
  },
  summaryLabelText: {
    fontSize: 10,
    color: '#5B756C',
    marginTop: 2,
    fontWeight: '500',
    textAlign: 'center',
  },
  summaryDividerLine: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(15, 56, 42, 0.08)',
  },
  featuresRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15, 56, 42, 0.04)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.06)',
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  featureTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F382A',
  },
  sampleMenuHeader: {
    marginBottom: 8,
  },
  sampleMenuTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0B261D',
    letterSpacing: -0.3,
  },
  sampleMenuSubtitle: {
    fontSize: 12.5,
    color: '#5B756C',
    marginTop: 3,
    fontWeight: '500',
  },
  menuScrollableContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  emptyText: {
    textAlign: "center",
    color: "#5B756C",
    marginVertical: 24,
    fontSize: 13,
    fontWeight: '500',
  },
  dayTabsScroll: {
    alignItems: 'center',
  },
  dayTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 4,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.12)',
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  dayTabsSingle: {
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
  },
  dayTab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  dayTabActive: {
    backgroundColor: '#166534',
    shadowColor: '#166534',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  dayTabActiveExpanded: {
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  dayTabSingleItem: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    minHeight: 38,
  },
  dayTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F6B61',
    letterSpacing: 0.2,
  },
  dayTabTextActive: {
    color: '#FAF8F5',
    fontWeight: '800',
    fontSize: 13.5,
  },
  unifiedDayAndMealCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  integratedMealSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  integratedMealTextLeft: {
    flex: 1,
    paddingRight: 10,
  },
  mealTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mealBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0F382A',
  },
  customMealTypeLabel: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0B261D',
    letterSpacing: -0.2,
  },
  mealActionSubtitle: {
    fontSize: 11.5,
    color: '#5B756C',
    marginTop: 3,
    fontWeight: '500',
  },
  bannerMealImage: {
    width: 76,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#E5ECE8',
  },
  integratedDividerLine: {
    height: 1,
    backgroundColor: 'rgba(15, 56, 42, 0.06)',
    marginTop: 12,
    marginBottom: 12,
  },
  integratedDaySelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  integratedDayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 56, 42, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.1)',
  },
  integratedDayBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0F382A',
    letterSpacing: 0.6,
  },
  embeddedDayTabsWrapper: {
    flex: 1,
  },
  customizationBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
  },
  headerStepContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionStepTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0B261D',
    letterSpacing: -0.2,
  },
  badgeContainer: {
    backgroundColor: 'rgba(15, 56, 42, 0.06)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.1)',
  },
  requirementBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F382A',
  },
  interactiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  interactiveRowActive: {
    backgroundColor: 'rgba(15, 56, 42, 0.02)',
    borderRadius: 12,
    paddingHorizontal: 6,
  },
  foodItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  circularFoodThumb: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#E5ECE8',
  },
  foodItemName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0B261D',
  },
  foodItemNameActive: {
    color: '#0F382A',
    fontWeight: '800',
  },
  addonPriceText: {
    fontSize: 11.5,
    color: '#0F382A',
    fontWeight: '800',
    marginTop: 2,
  },
  includedText: {
    fontSize: 11.5,
    color: '#5B756C',
    marginTop: 2,
    fontWeight: '500',
  },
  innerRowDivider: {
    height: 1,
    backgroundColor: 'rgba(15, 56, 42, 0.05)',
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(15, 56, 42, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  radioCircleActive: {
    borderColor: '#166534',
    backgroundColor: '#166534',
  },
  radioInnerDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#FAF8F5',
  },
  counterControlWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF8F5',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.12)',
    padding: 3,
    gap: 6,
  },
  counterActionBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
  },
  counterValueDisplay: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#4F6B61',
    minWidth: 16,
    textAlign: 'center',
  },
  counterValueActive: {
    color: '#0B261D',
    fontWeight: '800',
  },
  footer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 56, 42, 0.08)',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  breakdownCard: {
    backgroundColor: '#FAF8F5',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    marginBottom: 12,
  },
  breakdownHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F382A',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  breakdownItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 3,
  },
  breakdownLabelText: {
    fontSize: 12.5,
    color: '#4F6B61',
    fontWeight: '600',
  },
  breakdownQtyDimText: {
    color: '#0F382A',
    fontWeight: '700',
    fontSize: 11.5,
  },
  breakdownValueText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0B261D',
  },
  footerMainActionBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  footerPriceBlock: {
    flexDirection: 'column',
  },
  footerPrice: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0B261D',
    letterSpacing: -0.4,
  },
  footerPriceUnit: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5B756C',
    marginTop: 1,
  },
  choosePlanBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#166534',
    borderRadius: 24,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#166534',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  choosePlanText: {
    color: '#FAF8F5',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(11, 38, 29, 0.45)',
    justifyContent: 'flex-end',
  },
  modalDismissTapArea: {
    flex: 1,
  },
  modalBottomSheetContainer: {
    backgroundColor: '#FAF8F5',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 20,
  },
  modalClosePillButton: {
    position: 'absolute',
    top: -22,
    alignSelf: 'center',
    backgroundColor: '#166534',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
    shadowColor: '#166534',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 10,
    marginBottom: 14,
  },
  modalHeaderTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0B261D',
    letterSpacing: -0.3,
  },
  modalHeaderSubtitle: {
    fontSize: 12,
    color: '#5B756C',
    marginTop: 2,
    fontWeight: '500',
  },
  modalPillContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 4,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.1)',
  },
  modalPillContainerSingle: {
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
  },
  modalPillItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 6,
  },
  modalPillItemSingle: {
    flex: 0,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  modalPillItemActive: {
    backgroundColor: '#166534',
    shadowColor: '#166534',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  modalPillText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#4F6B61',
  },
  modalPillTextActive: {
    color: '#FAF8F5',
    fontWeight: '800',
  },
  modalPillCounter: {
    backgroundColor: '#FAF8F5',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPillCounterActive: {
    backgroundColor: 'rgba(250, 248, 245, 0.25)',
  },
  modalPillCounterText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F382A',
  },
  modalPillCounterTextActive: {
    color: '#FAF8F5',
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    paddingBottom: 20,
  },
  modalDaySectionBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  modalDayHeaderStrip: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 56, 42, 0.06)',
    paddingBottom: 8,
    marginBottom: 12,
  },
  modalDayTitleText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F382A',
    letterSpacing: 0.4,
  },
  modalEmptyDayText: {
    fontSize: 13,
    color: '#5B756C',
    textAlign: 'center',
    paddingVertical: 24,
    fontWeight: '500',
  },
  modalCategoryGroupBlock: {
    width: '100%',
  },
  modalCategorySectionHeadingBadge: {
    backgroundColor: 'rgba(15, 56, 42, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.1)',
  },
  modalCategorySectionHeadingText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F382A',
    letterSpacing: 0.3,
  },
  modalSelectionRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(15, 56, 42, 0.06)',
  },
  modalSelectionLeftInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 0.78,
  },
  modalCircularFoodThumb: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#E5ECE8',
  },
  modalItemNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0B261D',
  },
  modalRightBadgeWrapper: {
    alignItems: 'flex-end',
  },
  modalIncludedPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 124, 65, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 124, 65, 0.15)',
  },
  modalIncludedBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#107C41',
  },
  modalAddonPillBadge: {
    backgroundColor: 'rgba(15, 56, 42, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.15)',
  },
  modalAddonBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F382A',
  },
  modalFooterActionButtonBlock: {
    marginTop: 12,
    width: '100%',
  },
  modalFinalSubmitBtn: {
    backgroundColor: '#166534',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: '#166534',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  modalFinalSubmitText: {
    color: '#FAF8F5',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});