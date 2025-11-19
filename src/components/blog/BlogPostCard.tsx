"use client";

import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import type { FirestoreBlogPost, ClientBlogPost } from '@/types/firestore';
import type { Timestamp } from 'firebase/firestore';
import { useLoading } from '@/contexts/LoadingContext';
import { usePathname, useRouter } from 'next/navigation';

interface BlogPostCardProps {
  post: FirestoreBlogPost | ClientBlogPost;
  priority?: boolean;
}

export default function BlogPostCard({ post, priority = false }: BlogPostCardProps) {
  const { showLoading } = useLoading();
  const router = useRouter();

  const handleNav = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    showLoading();
    router.push(`/blog/${post.slug}`);
  };

  const excerpt = post.content.replace(/<[^>]*>?/gm, '').substring(0, 100) + '...';

  const getDisplayDate = (date: Timestamp | string): string => {
    if (typeof date === 'string') {
      return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    // Assumes it's a Firestore Timestamp
    return date.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <Link href={`/blog/${post.slug}`} onClick={handleNav} className="group block">
      <Card className="h-full flex flex-col overflow-hidden shadow-sm hover:shadow-xl transition-shadow duration-300">
        <div className="relative w-full aspect-[16/9]">
          <Image
            src={post.coverImageUrl}
            alt={post.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            priority={priority}
            data-ai-hint={post.imageHint || "blog post cover"}
          />
        </div>
        <CardHeader>
          <CardTitle className="text-lg font-headline leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {post.title}
          </CardTitle>
          <p className="text-xs text-muted-foreground pt-1">
            {getDisplayDate(post.createdAt)}
          </p>
        </CardHeader>
        <CardContent className="flex-grow">
          <CardDescription className="line-clamp-3 text-sm">
            {excerpt}
          </CardDescription>
        </CardContent>
        <CardFooter>
          <div className="flex items-center text-primary font-medium text-sm">
            Read More <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
}
