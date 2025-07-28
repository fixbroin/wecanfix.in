
"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';

// Extend Event type to include PWA-specific properties
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const PwaInstallButton = () => {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  
  const DISMISS_KEY = 'pwa_install_banner_dismissed';

  useEffect(() => {
    setIsMounted(true);
    if (sessionStorage.getItem(DISMISS_KEY) === 'true') {
      setIsDismissed(true);
    }
    
    // Check if the app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true) {
      setIsAppInstalled(true);
    }
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [isMounted]);

  const handleInstallClick = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent the main div click from firing
    if (!installPrompt) return;

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the PWA installation');
      setIsAppInstalled(true); // Hide button after installation
    } else {
      console.log('User dismissed the PWA installation');
    }
    setInstallPrompt(null);
  };
  
  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation(); // Stop the event from propagating to the parent div
    setIsDismissed(true);
    sessionStorage.setItem(DISMISS_KEY, 'true');
  };

  if (!isMounted || !installPrompt || isDismissed || isAppInstalled) {
    return null;
  }

  return (
    <div
      onClick={handleInstallClick}
      className="group fixed top-1/2 right-0 -translate-y-1/2 z-50 flex items-center bg-primary text-primary-foreground shadow-lg rounded-l-lg cursor-pointer transition-all duration-300 ease-in-out w-10 hover:w-36 h-12"
      aria-label="Install App"
      title="Install App"
    >
      <div className="flex items-center justify-between w-full h-full p-2">
        <Download className="h-6 w-6 text-primary-foreground flex-shrink-0 group-hover:animate-bounce" />
        <span className="text-sm font-medium whitespace-nowrap overflow-hidden transition-opacity duration-200 opacity-0 group-hover:opacity-100 ml-2">
          Install App
        </span>
      </div>
       <button
          onClick={handleDismiss}
          className="absolute -top-3 -left-3 h-6 w-6 rounded-full bg-secondary text-secondary-foreground border border-background/50 shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:bg-destructive hover:text-destructive-foreground"
          aria-label="Dismiss install button"
        >
          <X className="h-4 w-4" />
        </button>
    </div>
  );
};

export default PwaInstallButton;
