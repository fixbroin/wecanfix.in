
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Palette, Save, Loader2, RefreshCw, XCircle, Sun, Moon } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import type { GlobalWebSettings, ThemeColors, ThemePalette } from '@/types/firestore';
import { hexToHslString, hslStringToHex, DEFAULT_LIGHT_THEME_COLORS_HSL, DEFAULT_DARK_THEME_COLORS_HSL } from '@/lib/colorUtils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const WEB_SETTINGS_DOC_ID = "global";
const WEB_SETTINGS_COLLECTION = "webSettings";

interface ColorSettingConfig {
  id: keyof ThemePalette; // Now refers to keys within a palette
  label: string;
  cssVar: string; // For reference, though ThemeInjector handles CSS
}

const colorSettingsConfig: ColorSettingConfig[] = [
  { id: 'primary', label: 'Primary Color', cssVar: '--primary' },
  { id: 'foreground', label: 'Text Color', cssVar: '--foreground' },
  { id: 'accent', label: 'Highlight Color', cssVar: '--accent' },
  { id: 'background', label: 'Background Color', cssVar: '--background' },
];

type ThemeMode = 'light' | 'dark';

export default function ThemeSettingsPage() {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [currentColorsHex, setCurrentColorsHex] = useState<Record<ThemeMode, Record<keyof ThemePalette, string>>>({
    light: {
      primary: hslStringToHex(DEFAULT_LIGHT_THEME_COLORS_HSL.primary!),
      foreground: hslStringToHex(DEFAULT_LIGHT_THEME_COLORS_HSL.foreground!),
      accent: hslStringToHex(DEFAULT_LIGHT_THEME_COLORS_HSL.accent!),
      background: hslStringToHex(DEFAULT_LIGHT_THEME_COLORS_HSL.background!),
    },
    dark: {
      primary: hslStringToHex(DEFAULT_DARK_THEME_COLORS_HSL.primary!),
      foreground: hslStringToHex(DEFAULT_DARK_THEME_COLORS_HSL.foreground!),
      accent: hslStringToHex(DEFAULT_DARK_THEME_COLORS_HSL.accent!),
      background: hslStringToHex(DEFAULT_DARK_THEME_COLORS_HSL.background!),
    },
  });

  const loadThemeSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);
      const docSnap = await getDoc(settingsDocRef);
      if (docSnap.exists()) {
        const globalSettings = docSnap.data() as GlobalWebSettings;
        const loadedLightHexColors: Record<string, string> = {};
        const loadedDarkHexColors: Record<string, string> = {};

        colorSettingsConfig.forEach(config => {
          const lightHslValue = globalSettings.themeColors?.light?.[config.id];
          loadedLightHexColors[config.id] = lightHslValue ? hslStringToHex(lightHslValue) : hslStringToHex(DEFAULT_LIGHT_THEME_COLORS_HSL[config.id]!);
          
          const darkHslValue = globalSettings.themeColors?.dark?.[config.id];
          loadedDarkHexColors[config.id] = darkHslValue ? hslStringToHex(darkHslValue) : hslStringToHex(DEFAULT_DARK_THEME_COLORS_HSL[config.id]!);
        });
        setCurrentColorsHex({
          light: loadedLightHexColors as Record<keyof ThemePalette, string>,
          dark: loadedDarkHexColors as Record<keyof ThemePalette, string>,
        });
      } else {
        resetToDefaultColorsState();
      }
    } catch (error) {
      console.error("Error loading theme settings:", error);
      toast({ title: "Error", description: "Could not load theme settings.", variant: "destructive" });
      resetToDefaultColorsState();
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadThemeSettings();
  }, [loadThemeSettings]);

  const resetToDefaultColorsState = (mode?: ThemeMode) => {
    if (mode === 'light' || !mode) {
      const defaultLightHex: Record<string, string> = {};
      colorSettingsConfig.forEach(config => {
        defaultLightHex[config.id] = hslStringToHex(DEFAULT_LIGHT_THEME_COLORS_HSL[config.id]!);
      });
      setCurrentColorsHex(prev => ({ ...prev, light: defaultLightHex as Record<keyof ThemePalette, string> }));
    }
    if (mode === 'dark' || !mode) {
      const defaultDarkHex: Record<string, string> = {};
      colorSettingsConfig.forEach(config => {
        defaultDarkHex[config.id] = hslStringToHex(DEFAULT_DARK_THEME_COLORS_HSL[config.id]!);
      });
      setCurrentColorsHex(prev => ({ ...prev, dark: defaultDarkHex as Record<keyof ThemePalette, string> }));
    }
  };

  const handleColorChange = (mode: ThemeMode, id: keyof ThemePalette, hexValue: string) => {
    setCurrentColorsHex(prev => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        [id]: hexValue,
      },
    }));
  };

  const handleSaveTheme = async () => {
    setIsSaving(true);
    try {
      const themeColorsToSave: ThemeColors = {
        light: {},
        dark: {},
      };
      (Object.keys(currentColorsHex.light) as Array<keyof ThemePalette>).forEach(key => {
        if (currentColorsHex.light[key]) {
          themeColorsToSave.light![key] = hexToHslString(currentColorsHex.light[key]);
        }
      });
      (Object.keys(currentColorsHex.dark) as Array<keyof ThemePalette>).forEach(key => {
        if (currentColorsHex.dark[key]) {
          themeColorsToSave.dark![key] = hexToHslString(currentColorsHex.dark[key]);
        }
      });

      const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);
      await setDoc(settingsDocRef, { themeColors: themeColorsToSave, updatedAt: Timestamp.now() }, { merge: true });
      toast({ title: "Success", description: "Theme settings saved successfully." });
    } catch (error) {
      console.error("Error saving theme settings:", error);
      toast({ title: "Error", description: "Could not save theme settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleResetThemeModeToDefault = async (mode: ThemeMode) => {
    setIsSaving(true);
    try {
        const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);
        const currentDbSettingsSnap = await getDoc(settingsDocRef);
        const currentDbSettings = currentDbSettingsSnap.exists() ? currentDbSettingsSnap.data() as GlobalWebSettings : {};
        
        const newThemeColors = { ...currentDbSettings.themeColors };

        if (mode === 'light') {
            newThemeColors.light = { ...DEFAULT_LIGHT_THEME_COLORS_HSL };
        } else { // dark
            newThemeColors.dark = { ...DEFAULT_DARK_THEME_COLORS_HSL };
        }

        await setDoc(settingsDocRef, { themeColors: newThemeColors, updatedAt: Timestamp.now() }, { merge: true });
        resetToDefaultColorsState(mode); // Update local state for the specific mode
        toast({ title: `${mode.charAt(0).toUpperCase() + mode.slice(1)} Theme Reset`, description: `${mode.charAt(0).toUpperCase() + mode.slice(1)} theme has been reset to default colors.` });
    } catch (error) {
        console.error(`Error resetting ${mode} theme:`, error);
        toast({ title: "Error", description: `Could not reset ${mode} theme settings.`, variant: "destructive" });
    } finally {
        setIsSaving(false);
    }
  };

  const handleResetAllToDefault = async () => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);
      const themeColorsToSave: ThemeColors = {
        light: { ...DEFAULT_LIGHT_THEME_COLORS_HSL },
        dark: { ...DEFAULT_DARK_THEME_COLORS_HSL },
      };
      await setDoc(settingsDocRef, { themeColors: themeColorsToSave, updatedAt: Timestamp.now() }, { merge: true });
      resetToDefaultColorsState();
      toast({ title: "All Themes Reset", description: "Both light and dark themes have been reset to default colors." });
    } catch (error) {
      console.error("Error resetting all themes:", error);
      toast({ title: "Error", description: "Could not reset all theme settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };
  
  const renderColorInputs = (mode: ThemeMode) => {
    const defaultPalette = mode === 'light' ? DEFAULT_LIGHT_THEME_COLORS_HSL : DEFAULT_DARK_THEME_COLORS_HSL;
    return colorSettingsConfig.map((setting) => (
        <div key={`${mode}-${setting.id}`} className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border rounded-lg shadow-sm">
          <div className="flex items-center gap-3">
            <div style={{ backgroundColor: currentColorsHex[mode]?.[setting.id] || '#ffffff' }} className="w-8 h-8 rounded-md border" />
            <Label htmlFor={`${mode}-${setting.id}`} className="text-base font-medium">{setting.label}</Label>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Input
              id={`${mode}-${setting.id}`}
              type="color"
              value={currentColorsHex[mode]?.[setting.id] || hslStringToHex(defaultPalette[setting.id]!)}
              onChange={(e) => handleColorChange(mode, setting.id, e.target.value)}
              className="w-16 h-10 p-1 cursor-pointer"
              disabled={isSaving}
            />
            <Input
              type="text"
              value={currentColorsHex[mode]?.[setting.id]?.toUpperCase() || hslStringToHex(defaultPalette[setting.id]!).toUpperCase()}
              onChange={(e) => handleColorChange(mode, setting.id, e.target.value)}
              className="w-28 h-10"
              placeholder="#RRGGBB"
              disabled={isSaving}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleColorChange(mode, setting.id, hslStringToHex(defaultPalette[setting.id]!))}
              title={`Reset ${setting.label} to default for ${mode} theme`}
              disabled={isSaving || currentColorsHex[mode]?.[setting.id] === hslStringToHex(defaultPalette[setting.id]!)}
              className={currentColorsHex[mode]?.[setting.id] === hslStringToHex(defaultPalette[setting.id]!) ? "opacity-50" : ""}
            >
              <XCircle className="h-4 w-4 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        </div>
      ));
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3">Loading theme settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Palette className="mr-2 h-6 w-6 text-primary" /> Theme Settings
          </CardTitle>
          <CardDescription>
            Customize the look and feel of your website for both Light and Dark modes.
          </CardDescription>
        </CardHeader>
      </Card>
      
      <Tabs defaultValue="light" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="light"><Sun className="mr-2 h-4 w-4" /> Light Theme</TabsTrigger>
          <TabsTrigger value="dark"><Moon className="mr-2 h-4 w-4" /> Dark Theme</TabsTrigger>
        </TabsList>
        <TabsContent value="light">
          <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle>Light Theme Colors</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => handleResetThemeModeToDefault('light')} disabled={isSaving}>
                        <RefreshCw className="mr-2 h-3 w-3" /> Reset Light Theme
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {renderColorInputs('light')}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="dark">
          <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle>Dark Theme Colors</CardTitle>
                     <Button variant="outline" size="sm" onClick={() => handleResetThemeModeToDefault('dark')} disabled={isSaving}>
                        <RefreshCw className="mr-2 h-3 w-3" /> Reset Dark Theme
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {renderColorInputs('dark')}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t pt-6 mt-6">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={isSaving}>
              <RefreshCw className="mr-2 h-4 w-4" /> Reset All Themes to Defaults
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will reset ALL theme colors (Light and Dark) to their original defaults. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleResetAllToDefault} disabled={isSaving} className="bg-destructive hover:bg-destructive/90">
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Reset All Themes
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button onClick={handleSaveTheme} disabled={isSaving} size="lg">
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save All Theme Settings
        </Button>
      </CardFooter>
    </div>
  );
}

    