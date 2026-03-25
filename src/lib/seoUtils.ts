// src/lib/seoUtils.ts
import type { FirestoreSEOSettings } from '@/types/firestore';

// Define default SEO values
export const defaultSeoValues: FirestoreSEOSettings = {
  siteName: 'Wecanfix – Trusted Home Services in Bangalore',
  defaultMetaTitleSuffix: ' | Wecanfix Bangalore',
  defaultMetaDescription: 'Wecanfix provides top-rated home services in Bangalore including carpentry, electrical, plumbing, painting, and more. Book professional experts near you in Bangalore.',
  defaultMetaKeywords: 'wecanfix bangalore, home services bangalore, handyman services bangalore, carpenter in bangalore, electrician in bangalore',
  homepageMetaTitle: 'Wecanfix – Best Professional Home Services in Bangalore',
  homepageMetaDescription: 'Wecanfix helps you book the best trusted home services in Bangalore including carpentry, electrical, plumbing, painting, and installations. Bangalore\'s top-rated professional experts.',
  homepageMetaKeywords: 'wecanfix bangalore, home services bangalore, handyman near me bangalore, best home services in bangalore',
  homepageH1: 'Best Professional Home Services in Bangalore',
  categoryPageTitlePattern: 'Best {{categoryName}} Services in Bangalore | Professional {{categoryName}} | Wecanfix',
  categoryPageDescriptionPattern: 'Looking for the best {{categoryName}} services in Bangalore? Book professional {{categoryName}} experts in Bangalore for high-quality home maintenance and repairs.',
  categoryPageKeywordsPattern: 'best {{categoryName}} in bangalore, professional {{categoryName}} services bangalore, {{categoryName}} experts bangalore',
  categoryPageH1Pattern: 'Professional {{categoryName}} Services in Bangalore',
  cityCategoryPageTitlePattern: 'Best {{categoryName}} Services in {{cityName}} | Professional {{categoryName}} in Bangalore',
  cityCategoryPageDescriptionPattern: 'Hire the best {{categoryName}} services in {{cityName}}. Our professional {{categoryName}} experts provide reliable and affordable home solutions in Bangalore.',
  cityCategoryPageKeywordsPattern: '{{categoryName}} in {{cityName}}, {{categoryName}} services bangalore, best {{categoryName}} in {{cityName}}',
  cityCategoryPageH1Pattern: 'Best {{categoryName}} Services in {{cityName}}',
  areaCategoryPageTitlePattern: 'Top-Rated {{categoryName}} in {{areaName}}, {{cityName}} | Expert {{categoryName}} in Bangalore',
  areaCategoryPageDescriptionPattern: 'Need a professional {{categoryName}} in {{areaName}}, Bangalore? Book top-rated experts for all your {{categoryName}} needs in {{areaName}}.',
  areaCategoryPageKeywordsPattern: '{{categoryName}} in {{areaName}}, {{categoryName}} {{areaName}} bangalore, best {{categoryName}} {{areaName}}',
  areaCategoryPageH1Pattern: 'Expert {{categoryName}} Services in {{areaName}}, {{cityName}}',
  servicePageTitlePattern: '{{serviceName}} in Bangalore | Best Professional {{categoryName}} | Wecanfix',
  servicePageDescriptionPattern: 'Book professional {{serviceName}} in {{cityName}}, Bangalore. Expert {{categoryName}} solutions with trusted professionals and transparent pricing.',
  servicePageKeywordsPattern: '{{serviceName}} bangalore, {{categoryName}} {{cityName}}, book {{serviceName}} online bangalore',
  servicePageH1Pattern: 'Professional {{serviceName}} in Bangalore',
  areaPageTitlePattern: 'Best Home Services in {{areaName}}, {{cityName}} | Trusted Professionals in Bangalore',
  areaPageDescriptionPattern: 'Looking for reliable home services in {{areaName}}, Bangalore? Wecanfix provides top-rated professionals for all your home repair needs in {{areaName}}.',
  areaPageKeywordsPattern: 'home services {{areaName}}, handyman {{areaName}} bangalore, home repair {{areaName}}',
  areaPageH1Pattern: 'Trusted Home Services in {{areaName}}, {{cityName}}',
  cityPageTitlePattern: 'Best Professional Home Services in {{cityName}} | Top-Rated Experts in Bangalore',
  cityPageDescriptionPattern: 'Wecanfix provides the best professional home services in {{cityName}}. Book top-rated experts for carpentry, electrical, plumbing, and more in Bangalore.',
  cityPageKeywordsPattern: 'home services {{cityName}}, best handyman bangalore, professional home repair {{cityName}}',
  cityPageH1Pattern: 'Professional Home Services in {{cityName}}',
  structuredDataType: 'LocalBusiness',
  structuredDataName: 'Wecanfix',
  structuredDataStreetAddress: '#44, G S Palya Road, Konappana Agrahara, Electronic City Phase 2',
  structuredDataLocality: 'Bangalore',
  structuredDataRegion: 'Karnataka',
  structuredDataPostalCode: '560100',
  structuredDataCountry: 'IN',
  structuredDataTelephone: '+91-7353113455',
  structuredDataImage: 'https://wecanfix.in/android-chrome-512x512.png',
  socialProfileUrls: {
    facebook: 'https://www.facebook.com/wecanfix.in',
    twitter: 'https://x.com/wecanfix_in',
    instagram: 'https://www.instagram.com/wecanfix.in/',
    linkedin: 'https://www.linkedin.com/company/wecanfix-in',
    youtube: 'https://www.youtube.com/@wecanfix-in',
  },
};

/**
 * Utility to replace placeholders in a string.
 * @param template The string with placeholders like {{name}}
 * @param data An object containing values for the placeholders
 * @returns The string with placeholders replaced
 */
export function replacePlaceholders(
  template: string | undefined | null,
  data: Record<string, string | number | undefined | null>
): string {
  if (!template) return '';
  
  let result = template;
  try {
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const placeholderValue = data[key];
        if (placeholderValue !== undefined && placeholderValue !== null) {
           result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(placeholderValue));
        } else {
           result = result.replace(new RegExp(`{{${key}}}`, 'g'), '');
        }
      }
    }
  } catch (e) {
    return template;
  }
  return result.trim();
}
