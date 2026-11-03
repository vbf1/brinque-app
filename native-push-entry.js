import { PushNotifications } from '@capacitor/push-notifications';
import { App } from '@capacitor/app';

window.KidsLocPushNotifications = PushNotifications;
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
