
"use client"; 

import Link from 'next/link';
import Logo from '@/components/shared/Logo';
import { Facebook, Twitter, Instagram, Linkedin, Youtube } from 'lucide-react';
import { useGlobalSettings } from '@/hooks/useGlobalSettings'; 
import { Skeleton } from '@/components/ui/skeleton'; 
import { useEffect, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query, limit as firestoreLimit } from 'firebase/firestore';
import type { FirestoreCategory } from '@/types/firestore';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, usePathname } from 'next/navigation'; // Added usePathname
import { useLoading } from '@/contexts/LoadingContext'; 

interface FooterServiceLink {
  name: string;
  slug: string;
}

const FooterLink = ({ href, children }: { href: string; children: React.ReactNode }) => {
  const { user, triggerAuthRedirect } = useAuth();
  const { showLoading } = useLoading(); 
  const router = useRouter();
  const currentPathname = usePathname();

  const handleNav = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const intendedHref = href;
    if (intendedHref !== currentPathname && !intendedHref.startsWith('#')) {
      showLoading();
    }
    
    const isProtectedContent = intendedHref.startsWith('/category/') || intendedHref.startsWith('/service/');
    if (isProtectedContent && !user) {
      triggerAuthRedirect(intendedHref);
    } else {
      router.push(intendedHref);
    }
  };

  return (
    <Link href={href} onClick={handleNav} className="hover:text-primary transition-colors">
      {children}
    </Link>
  );
};


const Footer = () => {
  const currentYear = new Date().getFullYear();
  const [isMounted, setIsMounted] = useState(false);
  const { settings, isLoading: isLoadingGlobalSettings } = useGlobalSettings();
  const [serviceLinks, setServiceLinks] = useState<FooterServiceLink[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const { user, triggerAuthRedirect } = useAuth(); 
  const router = useRouter(); 


  const websiteName = settings?.websiteName || process.env.NEXT_PUBLIC_WEBSITE_NAME || "Wecanfix";
  const contactEmail = settings?.contactEmail || "wecanfix.in@gmail.com"; 
  const socialLinks = settings?.socialMediaLinks;

  useEffect(() => {
    setIsMounted(true);

    const fetchFooterCategories = async () => {
      setIsLoadingCategories(true);
      try {
        const categoriesCollectionRef = collection(db, "adminCategories");
        const q = query(categoriesCollectionRef, orderBy("order", "asc"), firestoreLimit(4));
        const data = await getDocs(q);
        const fetchedCategories = data.docs.map((doc) => ({
          name: doc.data().name as string,
          slug: doc.data().slug as string,
        }));
        setServiceLinks(fetchedCategories);
      } catch (err) {
        console.error("Error fetching categories for footer: ", err);
        setServiceLinks([]); 
      } finally {
        setIsLoadingCategories(false);
      }
    };

    fetchFooterCategories();
  }, []);

  if (!isMounted || isLoadingGlobalSettings || isLoadingCategories) {
    return (
      <footer className="bg-muted/50 text-muted-foreground border-t">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-8">
            <div className="col-span-1 lg:col-span-1">
              <Skeleton className="h-8 w-24 mb-4" /> 
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-3/4 mb-6" />
              <div className="flex space-x-4">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-5 w-5 rounded-full" />
              </div>
            </div>
            {[...Array(3)].map((_, i) => (
              <div key={i}>
                <Skeleton className="h-6 w-1/2 mb-4" />
                <ul className="space-y-2 text-sm">
                  {[...Array(4)].map((_, j) => <li key={j}><Skeleton className="h-4 w-3/4" /></li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-12 border-t pt-8 text-center text-sm">
            <Skeleton className="h-4 w-1/3 mx-auto" />
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="bg-muted/50 text-muted-foreground border-t">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-8">
          <div className="col-span-1 lg:col-span-1">
            <Logo logoUrl={settings?.logoUrl} websiteName={websiteName} />
            <p className="mt-4 text-sm">
              Your trusted partner for all home service needs. Quality, reliability, and convenience.
            </p>
            <div className="flex space-x-4 mt-6">
              {socialLinks?.facebook && (
                <Link href={socialLinks.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-muted-foreground hover:text-primary transition-colors">
                  <Facebook size={20} />
                </Link>
              )}
              {socialLinks?.twitter && (
                <Link href={socialLinks.twitter} target="_blank" rel="noopener noreferrer" aria-label="Twitter" className="text-muted-foreground hover:text-primary transition-colors">
                  <Twitter size={20} />
                </Link>
              )}
              {socialLinks?.instagram && (
                <Link href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-muted-foreground hover:text-primary transition-colors">
                  <Instagram size={20} />
                </Link>
              )}
              {socialLinks?.linkedin && (
                <Link href={socialLinks.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="text-muted-foreground hover:text-primary transition-colors">
                  <Linkedin size={20} />
                </Link>
              )}
              {socialLinks?.youtube && (
                <Link href={socialLinks.youtube} target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="text-muted-foreground hover:text-primary transition-colors">
                  <Youtube size={20} />
                </Link>
              )}
            </div>
          </div>

          <div>
            <h3 className="font-headline text-lg font-semibold text-foreground mb-4">Services</h3>
            <ul className="space-y-2 text-sm">
              {serviceLinks.map(link => (
                <li key={link.slug}>
                  <FooterLink href={`/category/${link.slug}`}>{link.name}</FooterLink>
                </li>
              ))}
              {serviceLinks.length === 0 && !isLoadingCategories && ( 
                <>
                  <li><FooterLink href="/category/plumbing-mock">Plumbing</FooterLink></li>
                  <li><FooterLink href="/category/electrical-mock">Electrical</FooterLink></li>
                  <li><FooterLink href="/category/ac-services-mock">AC Services</FooterLink></li>
                  <li><FooterLink href="/category/cleaning-mock">Cleaning</FooterLink></li>
                </>
              )}
               <li><FooterLink href="/categories"><span className="font-medium">View All</span></FooterLink></li>
            </ul>
          </div>

          <div>
            <h3 className="font-headline text-lg font-semibold text-foreground mb-4">Company</h3>
            <ul className="space-y-2 text-sm">
              <li><FooterLink href="/about-us">About Us</FooterLink></li>
              <li><FooterLink href="/contact-us">Contact Us</FooterLink></li>
              <li><FooterLink href="/careers">Careers</FooterLink></li>
              <li><FooterLink href="/terms-of-service">Terms of Service</FooterLink></li>
              <li><FooterLink href="/privacy-policy">Privacy Policy</FooterLink></li>
              <li><FooterLink href="/cancellation-policy">Cancellation Policy</FooterLink></li>
            </ul>
          </div>

          <div>
            <h3 className="font-headline text-lg font-semibold text-foreground mb-4">Support</h3>
            <ul className="space-y-2 text-sm">
              <li><FooterLink href="/faq">FAQ</FooterLink></li>
              <li><FooterLink href="/help-center">Help Center</FooterLink></li>
            </ul>
            {contactEmail && (
                 <p className="text-sm mt-4">Email: <a href={`mailto:${contactEmail}`} className="hover:text-primary">{contactEmail}</a></p>
            )}
            {settings?.contactMobile && (
                 <p className="text-sm mt-1">Phone: <a href={`tel:${settings.contactMobile}`} className="hover:text-primary">{settings.contactMobile}</a></p>
            )}
          </div>
        </div>

        <div className="mt-12 border-t pt-8 text-center text-sm">
          <p>&copy; {currentYear} {websiteName}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
