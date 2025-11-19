
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ArrowLeft, HelpCircle, Loader2, PackageSearch } from "lucide-react";
import type { FirestoreFAQ } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from '@/components/ui/skeleton';

export default function FAQPage() {
  const [faqs, setFaqs] = useState<FirestoreFAQ[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchFAQs = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const faqsCollectionRef = collection(db, "adminFAQs");
        const q = query(faqsCollectionRef, where("isActive", "==", true), orderBy("order", "asc"));
        const querySnapshot = await getDocs(q);
        const fetchedFAQs = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreFAQ));
        setFaqs(fetchedFAQs);
      } catch (err) {
        console.error("Error fetching FAQs:", err);
        setError("Failed to load FAQs. Please try again later.");
        toast({ title: "Error", description: "Could not fetch FAQs.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };

    fetchFAQs();
  }, [toast]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl md:text-4xl font-headline font-semibold text-foreground flex items-center">
          <HelpCircle className="mr-3 h-8 w-8 text-primary" />
          Frequently Asked Questions
        </h1>
        <Link href="/" passHref>
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4 max-w-2xl mx-auto">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="border rounded-md p-4">
              <Skeleton className="h-6 w-3/4 mb-2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6 mt-1" />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="text-center text-destructive py-10">{error}</p>
      ) : faqs.length === 0 ? (
        <div className="text-center py-12 max-w-md mx-auto">
          <PackageSearch className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-semibold mb-2">No FAQs Available</h2>
          <p className="text-muted-foreground">We haven't added any FAQs yet. Please check back later!</p>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq) => (
              <AccordionItem key={faq.id} value={`item-${faq.id}`}>
                <AccordionTrigger className="text-left hover:no-underline text-base md:text-lg">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm md:text-base leading-relaxed whitespace-pre-wrap">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}
    </div>
  );
}
