// src/app/about-us/page.tsx
import { adminDb } from '@/lib/firebaseAdmin';
import type { ContentPage, GlobalWebSettings } from "@/types/firestore";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, PackageSearch } from "lucide-react";
import type { Metadata, ResolvingMetadata } from 'next';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import { getBaseUrl } from '@/lib/config'; 
import AppImage from '@/components/ui/AppImage';

export const dynamic = 'force-dynamic'; 

const PAGE_SLUG = "about-us";

async function getPageData(slug: string): Promise<ContentPage | null> {
  try {
    const pageDocRef = adminDb.collection("contentPages").doc(slug);
    const docSnap = await pageDocRef.get();
    if (docSnap.exists) {
      const data = docSnap.data();
      return { id: docSnap.id, ...data } as ContentPage;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching content page for slug "${slug}":`, error);
    return null;
  }
}

async function getGlobalWebsiteSettings(): Promise<GlobalWebSettings | null> {
    try {
        const settingsDocRef = adminDb.collection("webSettings").doc("global");
        const docSnap = await settingsDocRef.get();
        if (docSnap.exists) {
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
  const siteName = resolvedParent.openGraph?.siteName || seoSettings.siteName || "Wecanfix";
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
  const ogImage = pageData.imageUrl || webSettings?.websiteIconUrl || webSettings?.logoUrl || seoSettings.structuredDataImage || `${appBaseUrl}/default-image.png`;
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

export default async function AboutUsPage() {
  try {
    const pageData = await getPageData(PAGE_SLUG);

    const breadcrumbItems: BreadcrumbItem[] = [
      { label: "Home", href: "/" },
      { label: pageData?.title || "About Us" },
    ];

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
      <div className="min-h-screen bg-muted/20 pb-16">
        <div className="container mx-auto px-4 py-8">
          <Breadcrumbs items={breadcrumbItems} />
          
          <div className="max-w-4xl mx-auto mt-6 bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
            {pageData.imageUrl && (
                <div className="relative w-full aspect-[21/9] overflow-hidden">
                    <AppImage 
                        src={pageData.imageUrl} 
                        alt={pageData.title} 
                        fill 
                        priority
                        className="object-cover hover:scale-105 transition-transform duration-700"
                        aiHint={pageData.imageHint || "about us banner"}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-6 md:p-10">
                        <h1 className="text-3xl md:text-5xl font-headline font-bold text-white drop-shadow-md">
                        {pageData.title}
                        </h1>
                    </div>
                </div>
            )}

            <div className="p-6 md:p-10 lg:p-12">
                {!pageData.imageUrl && (
                    <div className="mb-8 border-b pb-6">
                        <h1 className="text-4xl font-headline font-bold text-foreground">
                        {pageData.title}
                        </h1>
                    </div>
                )}

                {pageData.content ? (
                    <article
                    className="prose prose-lg prose-neutral dark:prose-invert max-w-none whitespace-pre-wrap
                                prose-headings:font-headline prose-headings:text-foreground prose-headings:font-bold
                                prose-p:text-foreground/80 prose-p:leading-relaxed
                                prose-a:text-primary hover:prose-a:text-primary/80 prose-a:font-semibold
                                prose-strong:text-foreground prose-strong:font-bold
                                prose-ul:list-disc prose-ol:list-decimal
                                prose-li:marker:text-primary"
                    dangerouslySetInnerHTML={{ __html: pageData.content }}
                    />
                ): (
                    <p className="text-muted-foreground italic text-center py-10">Content for this section is currently being updated. Please check back soon.</p>
                )}
            </div>
          </div>

          <div className="max-w-4xl mx-auto mt-12 bg-primary/10 rounded-2xl p-8 text-center border border-primary/20">
              <h3 className="text-2xl font-headline font-bold text-foreground mb-3">Ready to experience the Wecanfix difference?</h3>
              <p className="text-muted-foreground mb-6">Book a trusted professional for your home needs today.</p>
              <Link href="/" passHref>
                  <Button size="lg" className="rounded-full px-8 shadow-lg shadow-primary/25">
                      Explore Our Services
                  </Button>
              </Link>
          </div>

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
