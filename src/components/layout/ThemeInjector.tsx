
"use client";

import { useEffect } from 'react';
import { doc, onSnapshot } from "firebase/firestore";
import { db } from '@/lib/firebase';
import type { GlobalWebSettings, ThemeColors, ThemePalette } from '@/types/firestore';
import { DEFAULT_LIGHT_THEME_COLORS_HSL, DEFAULT_DARK_THEME_COLORS_HSL, THEME_PALETTE_KEYS } from '@/lib/colorUtils';

const WEB_SETTINGS_DOC_ID = "global";
const WEB_SETTINGS_COLLECTION = "webSettings";
const THEME_STYLE_TAG_ID = "wecanfix-dynamic-theme-styles";

// Simplified function to generate CSS variable declarations for a palette
const generatePaletteCssVariables = (palette: Partial<ThemePalette> | undefined, defaultPalette: Required<ThemePalette>): string => {
  let cssText = "";
  (Object.keys(defaultPalette) as Array<keyof ThemePalette>).forEach(key => {
    // The keys in THEME_PALETTE_KEYS are already kebab-case
    const cssVarName = `--${key}`;
    const hslValue = palette?.[key] || defaultPalette[key];
    
    if (hslValue) {
      cssText += `  ${cssVarName}: ${hslValue};\n`;
    }
  });
  return cssText;
};


const ThemeInjector = () => {
  useEffect(() => {
    const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);

    const applyDynamicStyles = (themeColors?: ThemeColors) => {
      let fullCssText = ":root {\n";
      fullCssText += generatePaletteCssVariables(themeColors?.light, DEFAULT_LIGHT_THEME_COLORS_HSL);
      fullCssText += "}\n\n";

      fullCssText += ".dark {\n";
      fullCssText += generatePaletteCssVariables(themeColors?.dark, DEFAULT_DARK_THEME_COLORS_HSL);
      fullCssText += "}\n";
      
      let styleTag = document.getElementById(THEME_STYLE_TAG_ID) as HTMLStyleElement | null;
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = THEME_STYLE_TAG_ID;
        document.head.appendChild(styleTag);
      }
      styleTag.textContent = fullCssText;
    };
    
    const unsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const globalSettings = docSnap.data() as GlobalWebSettings;
        applyDynamicStyles(globalSettings.themeColors);
      } else {
        // Document doesn't exist, apply hardcoded defaults for both themes
        applyDynamicStyles({
          light: DEFAULT_LIGHT_THEME_COLORS_HSL,
          dark: DEFAULT_DARK_THEME_COLORS_HSL,
        });
      }
    }, (error) => {
      console.error("Error fetching theme settings for injector:", error);
      // Fallback to hardcoded defaults on error
      applyDynamicStyles({
        light: DEFAULT_LIGHT_THEME_COLORS_HSL,
        dark: DEFAULT_DARK_THEME_COLORS_HSL,
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return null; // This component does not render anything itself
};

export default ThemeInjector;
