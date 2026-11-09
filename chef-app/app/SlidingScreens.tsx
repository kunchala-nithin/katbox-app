import React, { useRef, useState } from 'react'
import {
  View,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as SecureStore from 'expo-secure-store'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

const ONBOARDING_COMPLETED_KEY = 'katbox_chef_onboarding_completed'

const SLIDES = [
  { id: 1, source: require('../assets/images/slide1.png') },
  { id: 2, source: require('../assets/images/slide2.png') },
  { id: 3, source: require('../assets/images/slide3.png') },
  { id: 4, source: require('../assets/images/slide4.png') },
]

const SlidingScreens = () => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [starting, setStarting] = useState(false)
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const scrollViewRef = useRef<ScrollView>(null)

  const isFirstSlide = currentSlideIndex === 0
  const isLastSlide = currentSlideIndex === SLIDES.length - 1

  const scrollToSlide = (index: number) => {
    const safeIndex = Math.max(0, Math.min(index, SLIDES.length - 1))
    scrollViewRef.current?.scrollTo({
      x: safeIndex * SCREEN_WIDTH,
      animated: true,
    })
    setCurrentSlideIndex(safeIndex)
  }

  const handleNext = () => {
    if (currentSlideIndex < SLIDES.length - 1) {
      scrollToSlide(currentSlideIndex + 1)
    }
  }

  const handlePrev = () => {
    if (currentSlideIndex > 0) {
      scrollToSlide(currentSlideIndex - 1)
    }
  }

  const handleSkip = () => {
    scrollToSlide(SLIDES.length - 1)
  }

  const handleGetStarted = async () => {
    if (starting) return

    setStarting(true)
    try {
      await SecureStore.setItemAsync(ONBOARDING_COMPLETED_KEY, 'true')
      router.replace('/login' as any)
    } catch (error) {
      console.log('Could not save Chef onboarding completion:', error)
      setStarting(false)
    }
  }

  const handleScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x
    const nextIndex = Math.max(
      0,
      Math.min(
        Math.round(contentOffsetX / SCREEN_WIDTH),
        SLIDES.length - 1
      )
    )
    if (nextIndex !== currentSlideIndex) {
      setCurrentSlideIndex(nextIndex)
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {!isLastSlide && (
        <TouchableOpacity
          style={[styles.topSkipPill, { top: Math.max(insets.top, 16) + 6 }]}
          onPress={handleSkip}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding slides"
        >
          <Text style={styles.topSkipPillText}>Skip</Text>
        </TouchableOpacity>
      )}

      <View style={styles.imageContainer}>
        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          scrollEventThrottle={16}
          bounces={false}
          style={styles.scrollViewStyle}
        >
          {SLIDES.map((slide) => (
            <View key={slide.id} style={styles.slideWrapper}>
              <Image
                source={slide.source}
                style={styles.image}
                resizeMode="contain"
                accessible
                accessibilityLabel={`KatBox Chef onboarding slide ${slide.id}`}
              />
            </View>
          ))}
        </ScrollView>
      </View>

      <View
        style={[
          styles.unifiedControlsContainer,
          { bottom: Math.max(insets.bottom, 16) + 10 },
        ]}
      >
        {isLastSlide ? (
          <View style={styles.fullWidthLayout}>
            <TouchableOpacity
              style={[styles.getStartedButton, starting && styles.disabledButton]}
              onPress={handleGetStarted}
              activeOpacity={0.88}
              disabled={starting}
              accessibilityRole="button"
            >
              <Text style={styles.getStartedButtonText}>
                {starting ? 'Please wait...' : 'Let’s Get Started'}
              </Text>
              <Text style={styles.arrowIcon}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomBackLink}
              onPress={handlePrev}
              activeOpacity={0.7}
            >
              <Text style={styles.bottomBackLinkText}>← Back to previous</Text>
            </TouchableOpacity>

            <View style={[styles.dotContainer, styles.centeredDots]}>
              {SLIDES.map((slide, index) => (
                <View
                  key={slide.id}
                  style={index === currentSlideIndex ? styles.activeDot : styles.inactiveDot}
                />
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.rowLayout}>
            <View style={styles.dotContainer}>
              {SLIDES.map((slide, index) => (
                <View
                  key={slide.id}
                  style={index === currentSlideIndex ? styles.activeDot : styles.inactiveDot}
                />
              ))}
            </View>

            <View style={styles.buttonContainer}>
              {!isFirstSlide && (
                <TouchableOpacity
                  style={styles.prevButton}
                  onPress={handlePrev}
                  activeOpacity={0.88}
                >
                  <Text style={styles.prevButtonText}>Back</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.nextButton}
                onPress={handleNext}
                activeOpacity={0.88}
              >
                <Text style={styles.nextButtonText}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  topSkipPill: {
    position: 'absolute',
    right: 18,
    zIndex: 50,
    backgroundColor: '#072C0D',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CD8F2C',
    shadowColor: '#072C0D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  topSkipPillText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  imageContainer: {
    width: '100%',
    height: '80%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollViewStyle: {
    width: '100%',
    height: '100%',
  },
  slideWrapper: {
    width: SCREEN_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '95%',
    height: '93%',
    marginTop: 20,
  },
  unifiedControlsContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 120,
    justifyContent: 'center',
  },
  rowLayout: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fullWidthLayout: {
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  getStartedButton: {
    backgroundColor: '#072C0D',
    width: '100%',
    borderRadius: 16,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CD8F2C',
    shadowColor: '#072C0D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  disabledButton: {
    opacity: 0.65,
  },
  getStartedButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    flex: 1,
    paddingLeft: 24,
    letterSpacing: 0.2,
  },
  arrowIcon: {
    color: '#CD8F2C',
    fontSize: 20,
    fontWeight: '700',
    marginRight: 16,
  },
  bottomBackLink: {
    paddingVertical: 4,
  },
  bottomBackLinkText: {
    color: '#072C0D',
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.75,
  },
  dotContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 20,
  },
  centeredDots: {
    justifyContent: 'center',
    width: '100%',
  },
  activeDot: {
    width: 22,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#072C0D',
    marginHorizontal: 4,
  },
  inactiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(7, 44, 13, 0.18)',
    marginHorizontal: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  prevButton: {
    backgroundColor: '#FAF8F5',
    borderRadius: 16,
    height: 50,
    minWidth: 80,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#072C0D',
  },
  prevButtonText: {
    color: '#072C0D',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  nextButton: {
    backgroundColor: '#072C0D',
    borderRadius: 16,
    height: 50,
    minWidth: 100,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CD8F2C',
    shadowColor: '#072C0D',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
})

export default SlidingScreens
