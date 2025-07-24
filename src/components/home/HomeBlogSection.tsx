
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { FileText, Loader2, ArrowRight } from "lucide-react";
import type { FirestoreBlogPost } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import BlogPostCard from '@/components/blog/BlogPostCard';
import Link from 'next/link';
import { useLoading } from '@/contexts/LoadingContext';
import { useRouter } from 'next/navigation';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";

export default function HomeBlogSection() {
  const [posts, setPosts] = useState<FirestoreBlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { showLoading } = useLoading();

  useEffect(() => {
    const fetchAllPosts = async () => {
      setIsLoading(true);
      try {
        const postsRef = collection(db, "blogPosts");
        // Fetch all published posts, ordered by creation date
        const q = query(postsRef, where("isPublished", "==", true), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreBlogPost)));
      } catch (error) {
        console.error("Error fetching blog posts:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAllPosts();
  }, []);

  const handleNav = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    showLoading();
    router.push('/blog');
  };

  if (isLoading) {
    return (
      <section className="py-8 md:py-12 bg-secondary/30">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-headline font-semibold text-center mb-8 md:mb-12 text-foreground flex items-center justify-center">
            <FileText className="mr-2 h-6 w-6 text-primary" /> Our Blog
          </h2>
          <div className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
      </section>
    );
  }

  if (posts.length === 0) {
    return null;
  }

  return (
    <section className="py-8 md:py-12 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center mb-8 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-headline font-semibold text-foreground flex items-center">
            <FileText className="mr-2 h-6 w-6 text-primary" /> Our Blog
          </h2>
          <Link href="/blog" passHref legacyBehavior>
            <a onClick={handleNav}>
              <Button variant="outline">
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
          </Link>
        </div>
        
        <Carousel
          opts={{
              align: "start",
              dragFree: true,
          }}
          className="w-full"
        >
          <CarouselContent className="-ml-2 md:-ml-4">
            {posts.map((post, index) => (
              <CarouselItem key={post.id} className="pl-2 md:pl-4 basis-4/5 sm:basis-2/3 md:basis-1/2 lg:basis-1/3">
                  <div className="h-full">
                      <BlogPostCard post={post} priority={index < 3} />
                  </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="hidden md:flex" />
          <CarouselNext className="hidden md:flex" />
        </Carousel>
      </div>
    </section>
  );
}
