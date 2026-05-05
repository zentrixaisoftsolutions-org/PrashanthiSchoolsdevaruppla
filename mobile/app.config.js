const IS_DEV = process.env.APP_VARIANT === 'dev';

module.exports = {
  expo: {
    name: IS_DEV ? 'Sri Sai Prashanthi Vidyaniketan Dev' : 'Sri Sai Prashanthi Vidyaniketan',
    slug: 'prashanthi-schools',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/zentrix-ai-logo.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    scheme: IS_DEV ? 'prashanthischools-dev' : 'prashanthischools',
    splash: {
      image: './assets/school-logo.jpg',
      resizeMode: 'contain',
      backgroundColor: '#0f766e',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: IS_DEV ? 'com.prashanthischools.app.dev' : 'com.prashanthischools.app',
      infoPlist: {
        NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
        NSCameraUsageDescription: 'Allow Sri Sai Prashanthi Vidyaniketan to use the camera to capture homework worksheets.',
        NSPhotoLibraryUsageDescription: 'Allow Sri Sai Prashanthi Vidyaniketan to access your photos to attach worksheets.',
      },
    },
    android: {
      package: IS_DEV ? 'com.prashanthischools.app.dev' : 'com.prashanthischools.app',
      versionCode: IS_DEV ? 4 : 3,
      adaptiveIcon: {
        foregroundImage: './assets/zentrix-ai-logo.png',
        backgroundColor: IS_DEV ? '#0e4f9a' : '#0f766e',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      usesCleartextTraffic: true,
      permissions: [
        'android.permission.CAMERA',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.RECORD_AUDIO',
      ],
    },
    notification: {
      iconColor: IS_DEV ? '#0e4f9a' : '#0f766e',
      androidMode: 'default',
      androidCollapsedTitle: IS_DEV ? 'Sri Sai Prashanthi Vidyaniketan Dev' : 'Sri Sai Prashanthi Vidyaniketan',
    },
    plugins: [
      [
        'expo-image-picker',
        {
          photosPermission: 'Allow Sri Sai Prashanthi Vidyaniketan to access your photos to attach homework worksheets.',
          cameraPermission: 'Allow Sri Sai Prashanthi Vidyaniketan to use the camera to capture homework worksheets.',
        },
      ],
      ['expo-notifications', { color: IS_DEV ? '#0e4f9a' : '#0f766e' }],
      ['expo-build-properties', { android: { usesCleartextTraffic: true } }],
    ],
    web: { favicon: './assets/favicon.png' },
    extra: {
      apiBaseUrl: IS_DEV
        ? 'http://178.104.244.231/api'
        : 'http://178.104.244.231/api',
      eas: { projectId: '7afc64ba-e8f5-4bc9-a493-4fa07265ba84' },
    },
    owner: 'muraritech',
  },
};
