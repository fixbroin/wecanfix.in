
"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';

const THEME_STORAGE_KEY = 'fixbro-theme';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light'); // Initial default

  // Effect to set initial theme from localStorage or system preference
  useEffect(() => {
    let initialTheme: 'light' | 'dark' = 'light'; // Fallback default
    try {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY) as 'light' | 'dark' | null;
      if (storedTheme === 'light' || storedTheme === 'dark') {
        initialTheme = storedTheme;
      } else {
        // No valid theme in localStorage, check system preference
        if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
          initialTheme = 'dark';
        }
        // If no stored theme and system prefers light (or matchMedia not supported), it remains 'light'
      }
    } catch (e) {
      console.warn('ThemeToggle: Error accessing localStorage or matchMedia for initial theme.', e);
      // Keep default 'light' if error occurs
    }
    setTheme(initialTheme);
  }, []); // Runs once on mount

  // Effect to apply theme changes to DOM and localStorage
  useEffect(() => {
    // Ensure this effect only runs client-side after initial state is determined
    if (typeof window === 'undefined') return;

    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (e) {
      console.warn('ThemeToggle: Error writing theme to localStorage.', e);
    }
    try {
      window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
    } catch (e) {
      console.warn('ThemeToggle: Error dispatching themeChanged event.', e);
    }
  }, [theme]); // Runs whenever 'theme' state changes

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
      {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </Button>
  );
}
