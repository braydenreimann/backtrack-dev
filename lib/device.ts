export const isPhoneDevice = (userAgent: string) => {
  const ua = userAgent ?? '';
  const isIPhone = /iPhone/i.test(ua) || /iPod/i.test(ua);
  const isAndroidPhone = /Android/i.test(ua) && /Mobile/i.test(ua);
  const hasMobi = /Mobi/i.test(ua);
  return isIPhone || isAndroidPhone || hasMobi;
};
