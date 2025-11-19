import { adminDb } from '@/lib/firebaseAdmin';
import { Timestamp } from 'firebase-admin/firestore';
import { notFound } from 'next/navigation';
import type { Metadata, ResolvingMetadata } from 'next';
import type { FirestoreBlogPost } from '@/types/firestore';
import { getGlobalSEOSettings } from '@/lib/seoUtils';
import { getBaseUrl } from '@/lib/config';
import Image from 'next/image';
import Breadcrumbs from '@/components/shared/Breadcrumbs';

export const dynamic = 'force-dynamic';

interface BlogPostPageProps {
  params: { slug: string };
}

async function getPostData(slug: string): Promise<FirestoreBlogPost | null> {
  try {
    const postsRef = adminDb.collection('blogPosts');
    const q = postsRef.where('slug', '==', slug).where('isPublished', '==', true).limit(1);
    const snapshot = await q.get();
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as FirestoreBlogPost;
  } catch (error) {
    console.error('Error fetching blog post data:', error);
    return null;
  }
}

export async function generateStaticParams() {
  try {
    const postsSnapshot = await adminDb.collection('blogPosts').where('isPublished', '==', true).get();
    return postsSnapshot.docs.map(doc => ({ slug: doc.data().slug }));
  } catch (error) {
    console.error("Error generating static params for blog pages:", error);
    return [];
  }
}

export async function generateMetadata({ params }: BlogPostPageProps, parent: ResolvingMetadata): Promise<Metadata> {
  const post = await getPostData(params.slug);
  const seoSettings = await getGlobalSEOSettings();
  const siteName = seoSettings.siteName || "Wecanfix";
  const defaultSuffix = seoSettings.defaultMetaTitleSuffix || ` - ${siteName}`;
  const appBaseUrl = getBaseUrl();

  if (!post) {
    return {
      title: `Post Not Found${defaultSuffix}`,
      description: 'The blog post you are looking for does not exist.',
    };
  }
  
  const title = post.meta_title || post.title + defaultSuffix;
  const description = post.meta_description || post.content.substring(0, 160).replace(/<[^>]*>?/gm, '');
  const keywords = post.meta_keywords?.split(',').map(k => k.trim()).filter(Boolean);

  return {
    title,
    description,
    keywords: keywords,
    alternates: { canonical: `${appBaseUrl}/blog/${post.slug}` },
    openGraph: {
      title,
      description,
      type: 'article',
      publishedTime: post.createdAt?.toDate().toISOString(),
      modifiedTime: post.updatedAt?.toDate().toISOString(),
      url: `${appBaseUrl}/blog/${post.slug}`,
      images: post.coverImageUrl ? [{ url: post.coverImageUrl }] : [],
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const post = await getPostData(params.slug);

  if (!post) {
    notFound();
  }

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Blog', href: '/blog' },
    { label: post.title },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <Breadcrumbs items={breadcrumbItems} />
        <article>
          <header className="mb-8">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-headline font-bold text-foreground mb-4">
              {post.h1_title || post.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              By {post.authorName || 'Wecanfix Team'} · Published on {post.createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </header>
          {post.coverImageUrl && (
            <div className="relative w-full aspect-video rounded-lg overflow-hidden mb-8 shadow-lg">
              <Image
                src={post.coverImageUrl}
                alt={post.title}
                fill
                priority
                className="object-cover"
                data-ai-hint={post.imageHint || post.title.toLowerCase().split(' ').slice(0,2).join(' ')}
              />
            </div>
          )}
          <div
            className="prose prose-quoteless prose-neutral dark:prose-invert max-w-none
                       prose-headings:font-headline prose-headings:text-foreground
                       prose-p:text-foreground/80
                       prose-a:text-primary hover:prose-a:text-primary/80
                       prose-strong:text-foreground
                       prose-ul:list-disc prose-ol:list-decimal
                       prose-li:marker:text-primary"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        </article>
      </div>
    </div>
  );
}
