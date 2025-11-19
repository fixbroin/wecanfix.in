
"use client"; // Make it a client component

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PackageSearch, ArrowLeft } from 'lucide-react';
import React, { Suspense } from 'react'; // Import Suspense

function NotFoundContent() {
  // This component's rendering might trigger useSearchParams in AuthProvider
  // during the build process for the 404 page.
  return (
    <div className="container mx-auto px-4 py-16 text-center min-h-[calc(100vh-200px)] flex flex-col items-center justify-center">
      <PackageSearch className="mx-auto h-24 w-24 text-muted-foreground mb-6" />
      <h1 className="text-4xl font-bold text-destructive mb-4">404 - Page Not Found</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Oops! The page you are looking for does not exist or has been moved.
      </p>
      <Link href="/" passHref>
        <Button variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Back to Home
        </Button>
      </Link>
    </div>
  );
}

export default function NotFoundPage() {
  // The Suspense boundary here helps Next.js handle the dynamic parts
  // (potentially from AuthProvider using useSearchParams) during build.
  return (
    <Suspense fallback={
      <div className="container mx-auto px-4 py-16 text-center min-h-[calc(100vh-200px)] flex flex-col items-center justify-center">
        <PackageSearch className="mx-auto h-24 w-24 text-muted-foreground opacity-50 mb-6" />
        <h1 className="text-4xl font-bold text-destructive/50 mb-4">Loading Status...</h1>
      </div>
    }>
      <NotFoundContent />
    </Suspense>
  );
}
