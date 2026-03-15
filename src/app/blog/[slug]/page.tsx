import { adminDb } from '@/lib/firebaseAdmin';
import { notFound } from 'next/navigation';
import type { FirestoreBlogPost, ClientBlogPost } from '@/types/firestore';
import AppImage from '@/components/ui/AppImage';
import { ArrowLeft, ArrowRight, Calendar, User, Clock } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Timestamp } from 'firebase-admin/firestore';
import JsonLdScript from '@/components/shared/JsonLdScript';
import { getBaseUrl } from '@/lib/config';
import type { Metadata, ResolvingMetadata } from 'next';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import ShareButtons from '@/components/blog/ShareButtons';
import BlogPostCard from '@/components/blog/BlogPostCard';

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

async function getBlogPost(slug: string): Promise<FirestoreBlogPost | null> {
  try {
    const blogRef = adminDb.collection('blogPosts');
    const q = blogRef.where('slug', '==', slug).where('isPublished', '==', true).limit(1);
    const snapshot = await q.get();
    
    if (snapshot.empty) return null;
    
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as FirestoreBlogPost;
  } catch (error) {
    console.error('Error fetching blog post:', error);
    return null;
  }
}

export async function generateMetadata(
  { params }: BlogPostPageProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  
  if (!post) return {};

  const seoSettings = await getGlobalSEOSettings();
  const appBaseUrl = getBaseUrl();

  const title = post.metaTitle || post.meta_title || `${post.title} | Wecanfix Blog`;
  const description = post.metaDescription || post.meta_description || post.excerpt || post.title || '';
  
  const ogImage = post.coverImageUrl || seoSettings.structuredDataImage || `${appBaseUrl}/default-image.png`;

  return {
    title: title,
    description: description,
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: `${appBaseUrl}/blog/${slug}`,
    },
    openGraph: {
      title: title,
      description: description,
      url: `/blog/${slug}`,
      images: [{ url: ogImage }],
      type: 'article',
      publishedTime: post.createdAt instanceof Timestamp ? post.createdAt.toDate().toISOString() : undefined,
      modifiedTime: post.updatedAt instanceof Timestamp ? post.updatedAt.toDate().toISOString() : undefined,
      authors: post.authorName ? [post.authorName] : undefined,
    },
  };
}

export async function generateStaticParams() {
  try {
    const blogSnapshot = await adminDb.collection('blogPosts').where('isPublished', '==', true).get();
    return blogSnapshot.docs.map(doc => ({
      slug: (doc.data() as FirestoreBlogPost).slug,
    }));
  } catch (error) {
    console.error("Error generating static params for blog:", error);
    return [];
  }
}

async function getRelatedPosts(currentSlug: string, categoryId?: string): Promise<ClientBlogPost[]> {
  try {
    const blogPostsRef = adminDb.collection('blogPosts');
    let q = blogPostsRef.where('isPublished', '==', true);
    
    if (categoryId) {
      q = q.where('categoryId', '==', categoryId);
    }
    
    const snapshot = await q.limit(4).get();
    return snapshot.docs
      .map(doc => {
        const data = doc.data() as FirestoreBlogPost;
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt && typeof data.createdAt.toDate === 'function' 
            ? data.createdAt.toDate().toISOString() 
            : new Date().toISOString(),
          updatedAt: data.updatedAt && typeof data.updatedAt.toDate === 'function' 
            ? data.updatedAt.toDate().toISOString() 
            : undefined,
        } as ClientBlogPost;
      })
      .filter(post => post.slug !== currentSlug)
      .slice(0, 3);
  } catch (error) {
    console.error('Error fetching related posts:', error);
    return [];
  }
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    notFound();
  }

  const relatedPosts = await getRelatedPosts(slug, post.categoryId);

  const appBaseUrl = getBaseUrl();
  const postUrl = `${appBaseUrl}/blog/${post.slug}`;
  
  const publishDate = post.createdAt instanceof Timestamp ? post.createdAt.toDate() : new Date();
  const formattedDate = format(publishDate, 'MMMM dd, yyyy');

  const blogSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "image": post.coverImageUrl || `${appBaseUrl}/default-image.png`,
    "author": {
      "@type": "Person",
      "name": post.authorName || "Wecanfix Team"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Wecanfix",
      "logo": {
        "@type": "ImageObject",
        "url": `${appBaseUrl}/android-chrome-512x512.png`
      }
    },
    "datePublished": publishDate.toISOString(),
    "description": post.excerpt || post.metaDescription || post.meta_description
  };

  return (
    <article className="min-h-screen pb-20 bg-background/50">
      <JsonLdScript data={blogSchema} idSuffix={`blog-${post.id}`} />
      
      {/* Hero Section */}
      <div className="relative w-full aspect-square md:aspect-[16/9] lg:aspect-[21/9] overflow-hidden">
        <AppImage 
          src={post.coverImageUrl} 
          alt={post.title} 
          fill 
          priority
          objectPosition="top"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        <div className="absolute inset-0 flex items-end pb-20 md:pb-32">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl">
              <Link href="/blog" className="hidden md:inline-flex items-center text-sm font-medium mb-6 text-white/80 hover:text-white transition-colors group">
                <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" /> Back to Blog
              </Link>
              {post.categoryName && (
                <span className="inline-block px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-full mb-4 uppercase tracking-wider">
                  {post.categoryName}
                </span>
              )}
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-headline font-bold mb-6 text-white leading-[1.1]">
                {post.title}
              </h1>
              <div className="flex flex-wrap items-center gap-6 text-sm md:text-base font-medium text-white/90">
                <div className="flex items-center">
                  <Calendar className="mr-2 h-4 w-4 text-primary" /> {formattedDate}
                </div>
                <div className="flex items-center">
                  <User className="mr-2 h-4 w-4 text-primary" /> {post.authorName || "Wecanfix Team"}
                </div>
                <div className="flex items-center">
                  <Clock className="mr-2 h-4 w-4 text-primary" /> {post.readingTime || "5 min"} read
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-16 md:-mt-24 relative z-10">
        <div className="max-w-4xl mx-auto bg-card rounded-3xl shadow-2xl overflow-hidden border border-border/50">
          {/* Content */}
          <div className="p-6 md:p-12 lg:p-16">
            <div 
              className="prose prose-lg md:prose-xl dark:prose-invert max-w-none 
                prose-headings:font-headline prose-headings:font-bold 
                prose-p:text-foreground/80 prose-p:leading-relaxed
                prose-img:rounded-2xl prose-img:shadow-xl
                prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
              dangerouslySetInnerHTML={{ __html: post.content }}
            />
            
            {/* Tags */}
            {post.tags && post.tags.length > 0 && (
              <div className="mt-12 pt-8 border-t flex flex-wrap gap-2">
                {post.tags.map(tag => (
                  <span key={tag} className="px-4 py-1.5 bg-muted text-muted-foreground rounded-full text-sm font-medium hover:bg-primary/10 hover:text-primary transition-colors cursor-default">
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Social Share */}
            <div className="mt-12 pt-8 border-t">
              <ShareButtons title={post.title} url={postUrl} />
            </div>
          </div>
        </div>

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <div className="max-w-6xl mx-auto mt-20">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-headline font-bold">Related Articles</h2>
              <Link href="/blog" className="text-primary font-semibold hover:underline flex items-center gap-2">
                View All <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {relatedPosts.map(rp => (
                <BlogPostCard key={rp.id} post={rp} />
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
