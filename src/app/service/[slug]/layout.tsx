
import type { Metadata, ResolvingMetadata } from 'next';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreService, FirestoreCategory, FirestoreSubCategory, FirestoreSEOSettings, GlobalWebSettings } from '@/types/firestore';
import { getGlobalSEOSettings, replacePlaceholders } from '@/lib/seoUtils';
import { getBaseUrl } from '@/lib/config'; // Import the helper

export const dynamic = 'force-dynamic'; // Ensure metadata is fetched on each request

interface ServicePageLayoutProps {
  params: { slug: string };
  children: React.ReactNode;
}

interface ServicePageData extends FirestoreService {
  categoryName?: string;
  categorySlug?: string;
  subCategoryName?: string;
}

async function getServicePageData(slug: string): Promise<ServicePageData | null> {
  try {
    const servRef = adminDb.collection('adminServices');
    const q = servRef.where('slug', '==', slug).where('isActive', '==', true).limit(1);
    const snapshot = await q.get();
    if (snapshot.empty) return null;

    const serviceDoc = snapshot.docs[0];
    if (!serviceDoc.exists) return null;

    const serviceData = { id: serviceDoc.id, ...serviceDoc.data() } as ServicePageData;

    if (serviceData.subCategoryId) {
      const subCatDoc = await adminDb.collection('adminSubCategories').doc(serviceData.subCategoryId).get();
      if (subCatDoc.exists) {
        const subCategory = subCatDoc.data() as FirestoreSubCategory | undefined; 
        if (subCategory) { 
          serviceData.subCategoryName = subCategory.name;
          if (subCategory.parentId) {
            const catDoc = await adminDb.collection('adminCategories').doc(subCategory.parentId).get();
            if (catDoc.exists) {
              const category = catDoc.data() as FirestoreCategory | undefined; 
              if (category) { 
                serviceData.categoryName = category.name;
                serviceData.categorySlug = category.slug;
              }
            }
          }
        }
      }
    }
    return serviceData;
  } catch (error) {
    console.error('Error fetching service data for metadata:', error);
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
  { params }: ServicePageLayoutProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParent = await parent;

  const { slug } = await params;
  const serviceData = await getServicePageData(slug);
  const seoSettings = await getGlobalSEOSettings();
  const webSettings = await getGlobalWebsiteSettings();
  const siteName = resolvedParent.openGraph?.siteName || seoSettings.siteName || "Wecanfix";
  const defaultSuffix = seoSettings.defaultMetaTitleSuffix || ` - ${siteName}`;
  const appBaseUrl = getBaseUrl(); // Use the helper

  if (!serviceData) {
    return {
      title: `Service Not Found${defaultSuffix}`,
      description: 'The service you are looking for does not exist or is unavailable.',
      openGraph: {
        title: `Service Not Found${defaultSuffix}`,
        description: 'The service you are looking for does not exist or is unavailable.',
        siteName: siteName,
      }
    };
  }

  const title = serviceData.seo_title || 
                replacePlaceholders(seoSettings.servicePageTitlePattern, { 
                  serviceName: serviceData.name, 
                  categoryName: serviceData.categoryName || '', 
                  serviceDescription: (serviceData.shortDescription || serviceData.description || '').substring(0,60) + '...' 
                }) || 
                `${serviceData.name}${defaultSuffix}`;

  const description = serviceData.seo_description || 
                      replacePlaceholders(seoSettings.servicePageDescriptionPattern, { 
                        serviceName: serviceData.name, 
                        categoryName: serviceData.categoryName || '', 
                        serviceDescription: serviceData.description || ''
                      }) || 
                      serviceData.description || 
                      seoSettings.defaultMetaDescription || '';

  const keywordsStr = serviceData.seo_keywords || 
                      replacePlaceholders(seoSettings.servicePageKeywordsPattern, { 
                        serviceName: serviceData.name, 
                        categoryName: serviceData.categoryName || '' 
                      }) || 
                      seoSettings.defaultMetaKeywords;
  const keywords = keywordsStr?.split(',').map(k => k.trim()).filter(k => k);
  
  const ogImageFromWebSettings = webSettings?.websiteIconUrl || webSettings?.logoUrl;
  const ogImage = serviceData.imageUrl || ogImageFromWebSettings || seoSettings.structuredDataImage || `${appBaseUrl}/default-image.png`;
  const canonicalUrl = `${appBaseUrl}/service/${slug}`;

  return {
    title,
    description,
    keywords: keywords && keywords.length > 0 ? keywords : undefined,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      images: ogImage ? [{ url: ogImage }] : [],
      siteName,
      type: 'website', 
    },
  };
}

export default function ServiceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
