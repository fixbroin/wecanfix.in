
"use client";

import { useLoading } from '@/contexts/LoadingContext';
import AppLoader from './AppLoader';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const GlobalActionLoader: React.FC = () => {
  const { isLoading, hideLoading } = useLoading();
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

  return <AppLoader text="Processing..." />;
};

export default GlobalActionLoader;
