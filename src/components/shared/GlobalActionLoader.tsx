
"use client";

import { useLoading } from '@/contexts/LoadingContext';
import Logo from '@/components/shared/Logo';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const GlobalActionLoader: React.FC = () => {
  const { isLoading, hideLoading } = useLoading();
  const { settings: globalSettings, isLoading: settingsLoading } = useGlobalSettings();
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);

  useEffect(() => {
    if (isLoading && pathname !== previousPathnameRef.current) {
      hideLoading();
    }
    previousPathnameRef.current = pathname;
  }, [pathname, isLoading, hideLoading]);


  if (!isLoading) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[250] flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm"
      aria-live="assertive"
      aria-busy="true"
    >
      <div className="animate-pulse">
        {!settingsLoading && globalSettings ? (
          <Logo
            logoUrl={globalSettings.logoUrl}
            websiteName={globalSettings.websiteName}
            size="large"
          />
        ) : (
          <div className="flex items-center gap-2 text-primary">
            <span className="font-headline font-bold text-4xl">FixBro</span>
          </div>
        )}
      </div>
      <p className="mt-4 text-lg text-muted-foreground">Processing...</p>
    </div>
  );
};

export default GlobalActionLoader;

