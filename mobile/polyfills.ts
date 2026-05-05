// Force React Native core initialization (registers setImmediate, FormData,
// XMLHttpRequest, etc.) BEFORE any module that imports axios is evaluated.
import 'react-native/Libraries/Core/InitializeCore';

