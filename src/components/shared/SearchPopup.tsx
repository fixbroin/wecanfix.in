
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, XCircle, Image as ImageIcon } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import type { FirestoreService } from '@/types/firestore';
import Link from 'next/link';
import NextImage from 'next/image'; // Renamed to avoid conflict with Lucide's Image icon
import { ScrollArea } from '@/components/ui/scroll-area';

interface SearchPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

const SearchPopup: React.FC<SearchPopupProps> = ({ isOpen, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [allServices, setAllServices] = useState<FirestoreService[]>([]);
  const [filteredServices, setFilteredServices] = useState<FirestoreService[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchAllServices = useCallback(async () => {
    if (!isOpen || hasFetched) return; // Fetch only when open and not already fetched

    setIsLoading(true);
    setHasFetched(true); // Mark as fetched to prevent re-fetching on re-open unless component is unmounted/remounted
    try {
      const servicesCollectionRef = collection(db, "adminServices");
      // Only fetch active services
      const q = query(servicesCollectionRef, where("isActive", "==", true), orderBy("name", "asc"));
      const querySnapshot = await getDocs(q);
      const servicesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreService));
      setAllServices(servicesData);
      setFilteredServices(servicesData); // Initially show all (active) services or based on current term
    } catch (error) {
      console.error("Error fetching services for search:", error);
      // Optionally, set an error state and display a message
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, hasFetched]);

  useEffect(() => {
    if (isOpen && !hasFetched) {
      fetchAllServices();
    }
    // If popup closes, reset search term and hasFetched for next open.
    if (!isOpen) {
        setSearchTerm("");
        // setFilteredServices([]); // Clear results when closing
        // setHasFetched(false); // Reset fetch status if you want to re-fetch fresh data next time it opens
    }
  }, [isOpen, hasFetched, fetchAllServices]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredServices(allServices); // Show all fetched services if search term is empty
      return;
    }

    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    const results = allServices.filter(service => {
      return (
        service.name.toLowerCase().includes(lowerCaseSearchTerm) ||
        (service.description && service.description.toLowerCase().includes(lowerCaseSearchTerm)) ||
        (service.shortDescription && service.shortDescription.toLowerCase().includes(lowerCaseSearchTerm)) ||
        (service.fullDescription && service.fullDescription.toLowerCase().includes(lowerCaseSearchTerm)) ||
        service.slug.toLowerCase().includes(lowerCaseSearchTerm)
      );
    });
    setFilteredServices(results);
  }, [searchTerm, allServices]);

  const handleResultClick = () => {
    onClose();
    setSearchTerm(''); 
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg md:max-w-xl lg:max-w-2xl max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="font-headline flex items-center">
            <Search className="mr-2 h-5 w-5 text-primary" /> Search Services
          </DialogTitle>
          <DialogDescription>
            Find the service you need quickly.
          </DialogDescription>
        </DialogHeader>
        <div className="p-6 pt-2 border-b">
          <div className="relative">
            <Input
              id="search-popup-input"
              placeholder="e.g., AC Repair, Plumbing, Cleaning..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10 h-11 text-base"
              aria-label="Search services"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          </div>
        </div>

        <ScrollArea className="flex-grow">
          <div className="p-6 pt-2 space-y-3">
            {isLoading ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2 text-muted-foreground">Loading services...</p>
              </div>
            ) : searchTerm && filteredServices.length === 0 && !isLoading ? (
              <div className="text-center py-10">
                <XCircle className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No results found for "{searchTerm}".</p>
              </div>
            ) : filteredServices.length === 0 && !isLoading && hasFetched && allServices.length > 0 ? (
                 searchTerm ?  // This case is covered above. If searchTerm is empty and filtered is empty, means allServices were empty
                    null 
                    : <p className="text-center text-muted-foreground py-10">Type to search for services.</p> // Or show popular searches
            ) : filteredServices.length === 0 && !isLoading && hasFetched && allServices.length === 0 ? (
                 <p className="text-center text-muted-foreground py-10">No services available to search.</p>
            ) : (
              filteredServices.map(service => (
                <Link key={service.id} href={`/service/${service.slug}`} passHref legacyBehavior>
                  <a
                    onClick={handleResultClick}
                    className="block p-3 rounded-md hover:bg-accent/50 transition-colors border"
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
                        {service.imageUrl ? (
                          <NextImage
                            src={service.imageUrl}
                            alt={service.name}
                            fill
                            sizes="64px"
                            className="object-cover"
                            data-ai-hint={service.imageHint || "service"}
                          />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-muted-foreground absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                        )}
                      </div>
                      <div className="flex-grow">
                        <h4 className="font-semibold text-primary text-sm">{service.name}</h4>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {service.description || service.shortDescription || "View details..."}
                        </p>
                      </div>
                    </div>
                  </a>
                </Link>
              ))
            )}
          </div>
        </ScrollArea>
         <div className="p-4 border-t mt-auto">
            <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SearchPopup;
