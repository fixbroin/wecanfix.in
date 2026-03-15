
// src/app/contact-us/page.tsx
import { adminDb } from '@/lib/firebaseAdmin';
import type { ContentPage, GlobalWebSettings } from "@/types/firestore";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, PackageSearch, Mail, Phone, MapPin } from "lucide-react";
import type { Metadata, ResolvingMetadata } from 'next';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import { getBaseUrl } from '@/lib/config'; 

import ContactUsForm from "@/components/forms/ContactUsForm";
import AppImage from '@/components/ui/AppImage';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = 'force-dynamic';

const PAGE_SLUG = "contact-us";

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

export default async function ContactUsPage() {
  try {
    const [pageData, webSettings] = await Promise.all([
        getPageData(PAGE_SLUG),
        getGlobalWebsiteSettings()
    ]);

    const breadcrumbItems = [
        { label: "Home", href: "/" },
        { label: pageData?.title || "Contact Us" },
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
            <div className="max-w-6xl mx-auto mt-6">
            <div className="relative flex items-center justify-center mb-8">
                <div className="absolute left-0 hidden sm:block">
                <Link href="/" passHref>
                    <Button variant="outline" size="sm" className="bg-background">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
                    </Button>
                </Link>
                </div>
                <h1 className="text-3xl md:text-5xl font-headline font-bold text-foreground text-center">
                {pageData.title}
                </h1>
            </div>

            {pageData.imageUrl && (
                <div className="relative w-full aspect-[21/9] rounded-2xl overflow-hidden mb-12 shadow-lg border border-border/50">
                    <AppImage 
                        src={pageData.imageUrl} 
                        alt={pageData.title} 
                        fill 
                        priority
                        className="object-cover hover:scale-105 transition-transform duration-700"
                        aiHint={pageData.imageHint || "contact us banner"}
                    />
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
                {/* Left Side: Contact Info & Prose Content */}
                <div className="lg:col-span-5 space-y-8 order-2 lg:order-1">
                    {/* Contact Info Cards */}
                    <div className="grid gap-4">
                        {webSettings?.contactEmail && (
                            <Card className="border-none shadow-sm bg-card hover:shadow-md transition-shadow">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="bg-primary/10 p-3 rounded-full text-primary shrink-0">
                                        <Mail className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Email Us</p>
                                        <a href={`mailto:${webSettings.contactEmail}`} className="text-lg font-bold text-foreground hover:text-primary transition-colors">
                                            {webSettings.contactEmail}
                                        </a>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                        {webSettings?.contactMobile && (
                            <Card className="border-none shadow-sm bg-card hover:shadow-md transition-shadow">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="bg-primary/10 p-3 rounded-full text-primary shrink-0">
                                        <Phone className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Call Us</p>
                                        <a href={`tel:${webSettings.contactMobile}`} className="text-lg font-bold text-foreground hover:text-primary transition-colors">
                                            {webSettings.contactMobile}
                                        </a>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                        {webSettings?.address && (
                            <Card className="border-none shadow-sm bg-card hover:shadow-md transition-shadow">
                                <CardContent className="p-4 flex items-start gap-4">
                                    <div className="bg-primary/10 p-3 rounded-full text-primary shrink-0">
                                        <MapPin className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Our Location</p>
                                        <p className="text-base font-medium text-foreground leading-relaxed mt-1">
                                            {webSettings.address}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {pageData.content && (
                        <div className="bg-card p-6 md:p-8 rounded-2xl shadow-sm border border-border/50">
                            <article
                            className="prose prose-neutral dark:prose-invert max-w-none whitespace-pre-wrap
                                        prose-headings:font-headline prose-headings:text-foreground
                                        prose-p:text-foreground/80 prose-p:leading-relaxed
                                        prose-a:text-primary hover:prose-a:text-primary/80
                                        prose-strong:text-foreground
                                        prose-ul:list-disc prose-ol:list-decimal
                                        prose-li:marker:text-primary"
                            dangerouslySetInnerHTML={{ __html: pageData.content }}
                            />
                        </div>
                    )}
                </div>

                {/* Right Side: Contact Form */}
                <div className="lg:col-span-7 order-1 lg:order-2">
                    <div className="bg-card p-1 sm:p-2 rounded-2xl shadow-sm border border-border/50">
                        <ContactUsForm />
                    </div>
                </div>
            </div>
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
