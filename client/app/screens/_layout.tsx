import { Stack } from 'expo-router'
import React from 'react'

export default function ScreensLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
      }}
    >


      <Stack.Screen name="CartScreen" />
      <Stack.Screen name="AllChefCards" />
      <Stack.Screen name="CateringMealPlans" />
      <Stack.Screen name="CateringMenuItemScreen" />
      <Stack.Screen name="CateringOrderReview" />
      <Stack.Screen name="HomeMadeItemScreen" />
      <Stack.Screen name="ChefInfoScreen" />
      <Stack.Screen name="MealBoxPlans" />
      <Stack.Screen name="MealBoxItems" />
      <Stack.Screen name="MealBoxOrderReview" />
      <Stack.Screen name="CheckOutScreen" />
      <Stack.Screen name="OrderConfirmationScreen" />
    </Stack>

  )
}