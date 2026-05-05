import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import OtpScreen from '../screens/OtpScreen';
import HomeScreen from '../screens/HomeScreen';
import ChildDetailScreen from '../screens/ChildDetailScreen';
import AttendanceScreen from '../screens/AttendanceScreen';
import FeesScreen from '../screens/FeesScreen';
import ResultsScreen from '../screens/ResultsScreen';
import HomeworkScreen from '../screens/HomeworkScreen';
import TeacherHomeworkScreen from '../screens/TeacherHomeworkScreen';
import TeacherMarksScreen from '../screens/TeacherMarksScreen';
import TeacherReportsScreen from '../screens/TeacherReportsScreen';
import { colors } from '../theme';

const Stack = createNativeStackNavigator();

export const RootNavigator: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Otp" component={OtpScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="ChildDetail" component={ChildDetailScreen} />
            <Stack.Screen name="Attendance" component={AttendanceScreen} />
            <Stack.Screen name="Fees" component={FeesScreen} />
            <Stack.Screen name="Results" component={ResultsScreen} />
            <Stack.Screen name="Homework" component={HomeworkScreen} />
            <Stack.Screen name="TeacherHomework" component={TeacherHomeworkScreen} />
            <Stack.Screen name="TeacherMarks" component={TeacherMarksScreen} />
            <Stack.Screen name="TeacherReports" component={TeacherReportsScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
