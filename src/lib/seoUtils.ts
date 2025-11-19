
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { FirestoreSEOSettings } from '@/types/firestore';

// Define default SEO values that match the structure of FirestoreSEOSettings
export const defaultSeoValues: FirestoreSEOSettings = {
  siteName: 'Wecanfix',
  defaultMetaTitleSuffix: ' - Wecanfix',
  defaultMetaDescription: 'Wecanfix offers reliable home services. Book now!',
  defaultMetaKeywords: 'home services, repair, cleaning, plumbing, electrical',
  homepageMetaTitle: 'Wecanfix - Your Trusted Home Service Partner',
  homepageMetaDescription: 'Easily book trusted home services like plumbing, electrical, AC repair, and cleaning with Wecanfix. Quality and convenience guaranteed.',
  homepageMetaKeywords: 'wecanfix, home services, online booking, repair services, maintenance',
  homepageH1: 'Your Go-To for Reliable Home Services',
  categoryPageTitlePattern: '{{categoryName}} Services | Wecanfix',
  categoryPageDescriptionPattern: 'Find top-rated {{categoryName}} services. Quick, reliable, and affordable. Book {{categoryName}} experts today!',
  categoryPageKeywordsPattern: '{{categoryName}}, {{categoryName}} services, book {{categoryName}}',
  categoryPageH1Pattern: '{{categoryName}} Services',
  cityCategoryPageTitlePattern: '{{categoryName}} Services in {{cityName}} | Wecanfix',
  cityCategoryPageDescriptionPattern: 'Best {{categoryName}} services in {{cityName}}. Book online with Wecanfix.',
  cityCategoryPageKeywordsPattern: '{{categoryName}} {{cityName}}, {{cityName}} {{categoryName}} services, book {{categoryName}} in {{cityName}}',
  cityCategoryPageH1Pattern: '{{categoryName}} in {{cityName}}',
  areaCategoryPageTitlePattern: '{{categoryName}} in {{areaName}}, {{cityName}} | Wecanfix',
  areaCategoryPageDescriptionPattern: 'Expert {{categoryName}} services in {{areaName}}, {{cityName}}. Book with Wecanfix.',
  areaCategoryPageKeywordsPattern: '{{categoryName}} {{areaName}}, {{categoryName}} {{cityName}}, {{areaName}} {{categoryName}} services',
  areaCategoryPageH1Pattern: '{{categoryName}} in {{areaName}}, {{cityName}}',
  servicePageTitlePattern: '{{serviceName}} - {{categoryName}} | Wecanfix',
  servicePageDescriptionPattern: 'Book {{serviceName}} with Wecanfix. Get expert help now!',
  servicePageKeywordsPattern: '{{serviceName}}, {{categoryName}}, book {{serviceName}}',
  servicePageH1Pattern: '{{serviceName}}',
  areaPageTitlePattern: '{{areaName}} Services in {{cityName}} | Wecanfix',
  areaPageDescriptionPattern: 'Find the best home services in {{areaName}}, {{cityName}}. Quality and convenience by Wecanfix.',
  areaPageKeywordsPattern: '{{areaName}}, {{cityName}}, home services in {{areaName}}',
  areaPageH1Pattern: 'Services in {{areaName}}, {{cityName}}',
  structuredDataType: 'LocalBusiness',
  structuredDataName: 'Wecanfix',
  structuredDataStreetAddress: '',
  structuredDataLocality: '',
  structuredDataRegion: '',
  structuredDataPostalCode: '',
  structuredDataCountry: 'IN',
  structuredDataTelephone: '',
  structuredDataImage: '',
  socialProfileUrls: { facebook: '', twitter: '', instagram: '', linkedin: '', youtube: '' },
};

export async function getGlobalSEOSettings(): Promise<FirestoreSEOSettings> {
  try {
    const settingsDocRef = doc(db, 'seoSettings', 'global');
    const docSnap = await getDoc(settingsDocRef);
    if (docSnap.exists()) {
      // Combine fetched settings with defaults, giving precedence to fetched settings
      return { ...defaultSeoValues, ...(docSnap.data() as FirestoreSEOSettings) };
    }
    // If no settings in Firestore, return the hardcoded defaults
    return defaultSeoValues;
  } catch (error) {
    console.error('Error fetching global SEO settings:', error);
    // Fallback to defaults in case of an error
    return defaultSeoValues;
  }
}

export function replacePlaceholders(template?: string, data?: Record<string, string | undefined>): string {
  if (!template) return '';
  if (!data) return template;
  let result = template;
  try {
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        const placeholderValue = data[key];
        if (placeholderValue !== undefined && placeholderValue !== null) {
          result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(placeholderValue));
        } else {
          // Optionally remove placeholder if value is undefined/null or replace with empty string
           result = result.replace(new RegExp(`{{${key}}}`, 'g'), '');
        }
      }
    }
  } catch (e) {
    console.error("Error in replacePlaceholders:", e, "Template:", template, "Data:", data);
    return template; // Return original template on error to prevent breaking metadata
  }
  return result.trim();
}
