// src/app/cookie-policy/page.tsx
import { adminDb } from '@/lib/firebaseAdmin';
import type { GlobalWebSettings, FirestoreSEOSettings } from "@/types/firestore";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, PackageSearch, Cookie } from "lucide-react";
import type { Metadata, ResolvingMetadata } from 'next';
import { getGlobalSEOSettings } from '@/lib/seoUtils';
import { getBaseUrl } from '@/lib/config';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';

export const dynamic = 'force-dynamic';

const PAGE_SLUG = "cookie-policy";

async function getCookiePolicyData(): Promise<Pick<GlobalWebSettings, 'cookiePolicyContent'> | null> {
  try {
    const settingsDocRef = adminDb.collection("webSettings").doc("global");
    const docSnap = await settingsDocRef.get();
    if (docSnap.exists) {
      const data = docSnap.data() as GlobalWebSettings;
      return { cookiePolicyContent: data.cookiePolicyContent };
    }
    return null;
  } catch (error) {
    console.error(`Error fetching cookie policy content:`, error);
    return null;
  }
}

export async function generateMetadata(
  props: {},
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParent = await parent;

  const policyData = await getCookiePolicyData();
  const seoSettings = await getGlobalSEOSettings();
  const webSettings = await getGlobalSettings();
  const siteName = resolvedParent.openGraph?.siteName || seoSettings.siteName || "Wecanfix";
  const defaultSuffix = seoSettings.defaultMetaTitleSuffix || ` - ${siteName}`;
  const appBaseUrl = getBaseUrl();

  const pageTitle = `Cookie Policy${defaultSuffix}`;
  const pageDescription = policyData?.cookiePolicyContent?.substring(0, 160) || `Read our cookie policy to understand how ${siteName} uses cookies.`;
  const ogImage = webSettings?.websiteIconUrl || webSettings?.logoUrl || seoSettings.structuredDataImage || `${appBaseUrl}/default-image.png`;
  const canonicalUrl = `${appBaseUrl}/${PAGE_SLUG}`;

  return {
    title: pageTitle,
    description: pageDescription,
    keywords: ["cookie policy", "cookies", siteName.toLowerCase(), "privacy"],
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: pageTitle,
      description: pageDescription,
      url: canonicalUrl,
      siteName: siteName,
      type: 'website', 
      images: ogImage ? [{ url: ogImage }] : [],
    },
  };
}

async function getGlobalSettings(): Promise<GlobalWebSettings | null> {
    try {
        const settingsDocRef = adminDb.collection("webSettings").doc("global");
        const docSnap = await settingsDocRef.get();
        if (docSnap.exists) {
            return docSnap.data() as GlobalWebSettings;
        }
        return null;
    } catch (error) {
        console.error("Error fetching global web settings for page:", error);
        return null;
    }
}

export default async function CookiePolicyPage() {
  const policyData = await getCookiePolicyData();
  const pageTitleForDisplay = "Cookie Policy";

  const breadcrumbItems: BreadcrumbItem[] = [
      { label: "Home", href: "/" },
      { label: pageTitleForDisplay },
  ];

  if (!policyData || !policyData.cookiePolicyContent) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <PackageSearch className="mx-auto h-24 w-24 text-muted-foreground mb-6" />
        <h1 className="text-4xl font-bold text-destructive mb-4">Policy Not Found</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Sorry, the Cookie Policy content is not available at this moment.
        </p>
        <Link href="/" passHref>
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Go Back to Home
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Breadcrumbs items={breadcrumbItems} />
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link href="/" passHref>
            <Button variant="outline" size="sm" className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
            </Button>
          </Link>
          <h1 className="text-4xl font-headline font-semibold text-foreground mb-4 flex items-center">
            <Cookie className="mr-3 h-8 w-8 text-primary" /> {pageTitleForDisplay}
          </h1>
        </div>
        
        <article
            className="prose prose-quoteless prose-neutral dark:prose-invert max-w-none
                      prose-headings:font-headline prose-headings:text-foreground
                      prose-p:text-foreground/80
                      prose-a:text-primary hover:prose-a:text-primary/80
                      prose-strong:text-foreground
                      prose-ul:list-disc prose-ol:list-decimal
                      prose-li:marker:text-primary"
            dangerouslySetInnerHTML={{ __html: policyData.cookiePolicyContent }}
        />
      </div>
    </div>
  );
}
