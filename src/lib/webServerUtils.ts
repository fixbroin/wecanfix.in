
'use server';

import { adminDb } from './firebaseAdmin';
import type { GlobalWebSettings, ThemePalette } from '@/types/firestore';
import { DEFAULT_LIGHT_THEME_COLORS_HSL, DEFAULT_DARK_THEME_COLORS_HSL, THEME_PALETTE_KEYS } from '@/lib/colorUtils';
import { defaultGlobalWebSettings } from '@/config/webDefaults';
import { cache } from 'react';

const WEB_SETTINGS_DOC_ID = "global";
const WEB_SETTINGS_COLLECTION = "webSettings";

/**
 * Fetches global web settings with server-side request memoization using Admin SDK.
 * This is safe to call only from Server Components or Server Actions.
 */
export const getGlobalWebSettings = cache(async (): Promise<GlobalWebSettings> => {
  try {
    const docSnap = await adminDb.collection(WEB_SETTINGS_COLLECTION).doc(WEB_SETTINGS_DOC_ID).get();
    if (docSnap.exists) {
      const data = docSnap.data() as Partial<GlobalWebSettings>;
      
      const mergedLightPalette: Required<ThemePalette> = { ...DEFAULT_LIGHT_THEME_COLORS_HSL };
      THEME_PALETTE_KEYS.forEach(key => {
        if (data.themeColors?.light?.[key]) {
          (mergedLightPalette[key] as any) = data.themeColors.light[key];
        }
      });

      const mergedDarkPalette: Required<ThemePalette> = { ...DEFAULT_DARK_THEME_COLORS_HSL };
      THEME_PALETTE_KEYS.forEach(key => {
        if (data.themeColors?.dark?.[key]) {
          (mergedDarkPalette[key] as any) = data.themeColors.dark[key];
        }
      });

      return {
        ...defaultGlobalWebSettings,
        ...data,
        themeColors: {
          light: mergedLightPalette,
          dark: mergedDarkPalette,
        },
        socialMediaLinks: {
          ...defaultGlobalWebSettings.socialMediaLinks,
          ...(data.socialMediaLinks || {}),
        },
        globalAdminPopup: {
          ...defaultGlobalWebSettings.globalAdminPopup,
          ...(data.globalAdminPopup || {}),
        },
      } as GlobalWebSettings;
    }
    return defaultGlobalWebSettings;
  } catch (error) {
    console.error('Error fetching global web settings via Admin SDK:', error);
    return defaultGlobalWebSettings;
  }
});
