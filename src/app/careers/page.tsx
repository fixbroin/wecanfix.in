
// src/app/careers/page.tsx
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ContentPage, GlobalWebSettings, FirestoreSEOSettings } from "@/types/firestore";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, PackageSearch } from "lucide-react";
import type { Metadata, ResolvingMetadata } from 'next';
import { getGlobalSEOSettings } from '@/lib/seoUtils';
import { getBaseUrl } from '@/lib/config'; 

export const dynamic = 'force-dynamic'; 

const PAGE_SLUG = "careers";

async function getPageData(slug: string): Promise<ContentPage | null> {
  try {
    const pageDocRef = doc(db, "contentPages", slug);
    const docSnap = await getDoc(pageDocRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as ContentPage;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching content page for slug "${slug}":`, error);
    return null;
  }
}

async function getGlobalWebsiteSettings(): Promise<GlobalWebSettings | null> {
    try {
        const settingsDocRef = doc(db, "webSettings", "global");
        const docSnap = await getDoc(settingsDocRef);
        if (docSnap.exists()) {
            return docSnap.data() as GlobalWebSettings;
        }
        return null;
    } catch (error) {
        console.error("Error fetching global web settings for metadata:", error);
        return null;
    }
}

export async function generateMetadata(
  props: {},
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParent = await parent;

  const pageData = await getPageData(PAGE_SLUG);
  const seoSettings = await getGlobalSEOSettings();
  const webSettings = await getGlobalWebsiteSettings();
  const siteName = resolvedParent.openGraph?.siteName || seoSettings.siteName || "wecanfix";
  const defaultSuffix = seoSettings.defaultMetaTitleSuffix || ` - ${siteName}`;
  const appBaseUrl = getBaseUrl(); 

  if (!pageData) {
    return {
      title: `Page Not Found${defaultSuffix}`,
      description: "The page you are looking for does not exist.",
      openGraph: {
        title: `Page Not Found${defaultSuffix}`,
        description: "The page you are looking for does not exist.",
        siteName: siteName,
      }
    };
  }

  const title = `${pageData.title}${defaultSuffix}`;
  const description = pageData.content?.substring(0, 160) || seoSettings.defaultMetaDescription || `Information about ${pageData.title}`;
  const keywords = seoSettings.defaultMetaKeywords?.split(',').map(k => k.trim()).filter(k => k);
  const ogImage = webSettings?.websiteIconUrl || webSettings?.logoUrl || seoSettings.structuredDataImage || `${appBaseUrl}/default-image.png`;
  const canonicalUrl = `${appBaseUrl}/${PAGE_SLUG}`;

  return {
    title: title,
    description: description,
    keywords: keywords && keywords.length > 0 ? keywords : undefined,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: title,
      description: description,
      url: canonicalUrl,
      siteName: siteName,
      type: 'article',
      images: ogImage ? [{ url: ogImage }] : [],
    },
  };
}

export default async function CareersPage() {
  try {
    const pageData = await getPageData(PAGE_SLUG);

    if (!pageData) {
      return (
        <div className="container mx-auto px-4 py-16 text-center">
          <PackageSearch className="mx-auto h-24 w-24 text-muted-foreground mb-6" />
          <h1 className="text-4xl font-bold text-destructive mb-4">404 - Page Not Found</h1>
          <p className="text-lg text-muted-foreground mb-8">
            Sorry, the page for '{PAGE_SLUG}' could not be found.
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
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <Link href="/" passHref>
              <Button variant="outline" size="sm" className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
              </Button>
            </Link>
            <h1 className="text-4xl font-headline font-semibold text-foreground mb-4">
              {pageData.title}
            </h1>
            {pageData.updatedAt && (
              <p className="text-sm text-muted-foreground">
                Last updated: {pageData.updatedAt.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </p>
            )}
          </div>
          
          {pageData.content ? (
              <article
              className="prose prose-quoteless prose-neutral dark:prose-invert max-w-none
                        prose-headings:font-headline prose-headings:text-foreground
                        prose-p:text-foreground/80
                        prose-a:text-primary hover:prose-a:text-primary/80
                        prose-strong:text-foreground
                        prose-ul:list-disc prose-ol:list-decimal
                        prose-li:marker:text-primary"
              dangerouslySetInnerHTML={{ __html: pageData.content }}
              />
          ): (
              <p className="text-muted-foreground">No content available for this page yet.</p>
          )}
        </div>
      </div>
    );
  } catch (error) {
    console.error(`Error rendering page ${PAGE_SLUG}:`, error);
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <PackageSearch className="mx-auto h-24 w-24 text-muted-foreground mb-6" />
        <h1 className="text-4xl font-bold text-destructive mb-4">Server Error</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Sorry, an error occurred while trying to load this page.
        </p>
        <Link href="/" passHref>
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Go Back to Home
          </Button>
        </Link>
      </div>
    );
  }
}
