
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,

        // Keep previously visited screens mounted.
        freezeOnBlur: true,

        tabBarActiveTintColor: "#B6F36B",
        tabBarInactiveTintColor: "#777777",

        tabBarStyle: {
          backgroundColor: "#151515",
          borderTopColor: "#303030",
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingTop: 7,
          paddingBottom: Math.max(insets.bottom, 8),
          elevation: 0,
        },

        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },

        tabBarItemStyle: {
          paddingVertical: 2,
        },

        sceneStyle: {
          backgroundColor: "#101010",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={size}
              color={focused ? "#B6F36B" : "#777777"}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name={focused ? "bar-chart" : "bar-chart-outline"}
              size={size}
              color={focused ? "#B6F36B" : "#777777"}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="friends"
        options={{
          title: "Friends",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name={focused ? "people" : "people-outline"}
              size={size}
              color={focused ? "#B6F36B" : "#777777"}
            />
          ),
        }}
      />
    </Tabs>
  );
}
