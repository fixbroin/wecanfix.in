
"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import type { FirestoreCity, FirestoreArea } from '@/types/firestore';
import { Loader2, MapPin } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Link from 'next/link';
import { useLoading } from '@/contexts/LoadingContext';
import { useRouter } from 'next/navigation';

interface CityWithAreas extends FirestoreCity {
  areas: FirestoreArea[];
}

export default function ExploreByLocation() {
  const [citiesWithAreas, setCitiesWithAreas] = useState<CityWithAreas[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { showLoading } = useLoading();
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const citiesQuery = query(collection(db, "cities"), where("isActive", "==", true), orderBy("name"));
        const citiesSnapshot = await getDocs(citiesQuery);
        const citiesData = citiesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreCity));
        
        const enrichedCitiesPromises = citiesData.map(async (city) => {
          const areasQuery = query(collection(db, "areas"), where("cityId", "==", city.id), where("isActive", "==", true), orderBy("name"));
          const areasSnapshot = await getDocs(areasQuery);
          const areasData = areasSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreArea));
          return { ...city, areas: areasData };
        });

        const resolvedCitiesData = await Promise.all(enrichedCitiesPromises);
        setCitiesWithAreas(resolvedCitiesData);

      } catch (error) {
        console.error("Error fetching locations for Explore section:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleNav = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    showLoading();
    router.push(href);
  };
  
  if (isLoading) {
    return (
      <section className="py-8 md:py-12">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-headline font-semibold text-center mb-8 text-foreground">Explore By Location</h2>
          <div className="flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        </div>
      </section>
    );
  }

  if (citiesWithAreas.length === 0) {
    return null; 
  }

  return (
    <section className="py-8 md:py-12 bg-muted/30">
      <div className="container mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-headline font-semibold text-center mb-8 text-foreground">
          Explore By Location
        </h2>
        <Accordion type="multiple" className="w-full max-w-4xl mx-auto">
          {citiesWithAreas.map((city) => (
            <AccordionItem value={city.id} key={city.id}>
              <AccordionTrigger className="text-lg font-medium hover:no-underline">
                <Link href={`/${city.slug}`} onClick={(e) => handleNav(e, `/${city.slug}`)} className="hover:text-primary">{city.name}</Link>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2 pl-2">
                  {city.areas.map((area) => (
                    <li key={area.id}>
                      <Link href={`/${city.slug}/${area.slug}`} onClick={(e) => handleNav(e, `/${city.slug}/${area.slug}`)} className="flex items-center text-sm text-muted-foreground hover:text-primary transition-colors py-1">
                        <MapPin className="h-3.5 w-3.5 mr-2" /> {area.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

    