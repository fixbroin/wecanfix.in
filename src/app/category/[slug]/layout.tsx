
import type { Metadata, ResolvingMetadata } from 'next';
import { doc, getDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { FirestoreCategory, FirestoreSEOSettings, GlobalWebSettings } from '@/types/firestore';
import { getGlobalSEOSettings, replacePlaceholders } from '@/lib/seoUtils';
import { getBaseUrl } from '@/lib/config'; // Import the helper

export const dynamic = 'force-dynamic'; // Ensure metadata is fetched on each request

interface CategoryPageLayoutProps {
  params: { slug: string };
  children: React.ReactNode;
}

async function getCategoryData(slug: string): Promise<FirestoreCategory | null> {
  try {
    const catRef = collection(db, 'adminCategories');
    const q = query(catRef, where('slug', '==', slug), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as FirestoreCategory;
  } catch (error) {
    console.error('Error fetching category data for metadata:', error);
    return null;
  }
}

// Function to fetch global web settings (e.g., for OG image)
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
  { params }: CategoryPageLayoutProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParent = await parent;

  const slug = params.slug;
  const categoryData = await getCategoryData(slug);
  const seoSettings = await getGlobalSEOSettings();
  const webSettings = await getGlobalWebsiteSettings();
  const siteName = resolvedParent.openGraph?.siteName || seoSettings.siteName || "FixBro";
  const defaultSuffix = seoSettings.defaultMetaTitleSuffix || ` - ${siteName}`;
  const appBaseUrl = getBaseUrl(); // Use the helper


  if (!categoryData) {
    return {
      title: `Category Not Found${defaultSuffix}`,
      description: 'The category you are looking for does not exist.',
      openGraph: {
        title: `Category Not Found${defaultSuffix}`,
        description: 'The category you are looking for does not exist.',
        siteName: siteName,
      }
    };
  }

  const titleData = { categoryName: categoryData.name };
  const title = categoryData.seo_title || replacePlaceholders(seoSettings.categoryPageTitlePattern, titleData) || `${categoryData.name}${defaultSuffix}`;
  const description = categoryData.seo_description || replacePlaceholders(seoSettings.categoryPageDescriptionPattern, titleData) || seoSettings.defaultMetaDescription || `Services in ${categoryData.name}`;
  const keywordsStr = categoryData.seo_keywords || replacePlaceholders(seoSettings.categoryPageKeywordsPattern, titleData) || seoSettings.defaultMetaKeywords;
  const keywords = keywordsStr?.split(',').map(k => k.trim()).filter(k => k);
  
  const ogImageFromWebSettings = webSettings?.websiteIconUrl || webSettings?.logoUrl;
  const ogImage = categoryData.imageUrl || ogImageFromWebSettings || seoSettings.structuredDataImage || `${appBaseUrl}/default-og-image.png`;
  const canonicalUrl = `${appBaseUrl}/category/${slug}`;

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

export default function CategoryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
