import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { App } from '@capacitor/app';

window.Capacitor = window.Capacitor || Capacitor;
window.KidsLocFirebaseMessaging = FirebaseMessaging;
window.KidsLocApp = App;

App.addListener('backButton', ({ canGoBack }) => {
  if (typeof window.kidsLocHandleBack === 'function') {
    const handled = window.kidsLocHandleBack();
    if (handled) return;
  }
  if (canGoBack) {
    window.history.back();
    return;
  }
  App.exitApp();
});
