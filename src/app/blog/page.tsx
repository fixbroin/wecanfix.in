import { adminDb } from '@/lib/firebaseAdmin';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase-admin/firestore';
import type { FirestoreBlogPost, ClientBlogPost } from '@/types/firestore';
import BlogPostCard from '@/components/blog/BlogPostCard';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { Metadata } from 'next';
import { getBaseUrl } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const appBaseUrl = getBaseUrl();
  const canonicalUrl = `${appBaseUrl}/blog`;

  return {
    title: "Blog",
    description: "Tips, guides, and updates from the Wecanfix team to help you with your home needs.",
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: "Blog | Wecanfix",
      description: "Tips, guides, and updates from the Wecanfix team to help you with your home needs.",
      url: canonicalUrl,
      type: 'website',
    },
  };
}


async function getPublishedPosts(): Promise<ClientBlogPost[]> {
  try {
    const postsRef = adminDb.collection('blogPosts');
    const q = postsRef.where('isPublished', '==', true).orderBy('createdAt', 'desc');
    const snapshot = await q.get();
    
    const posts: ClientBlogPost[] = snapshot.docs.map(doc => {
      const data = doc.data() as FirestoreBlogPost;
      return {
        ...data,
        id: doc.id,
        // Serialize Timestamps to ISO strings
        createdAt: data.createdAt.toDate().toISOString(),
        updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : undefined,
      };
    });
    return posts;
  } catch (error) {
    console.error("Error fetching blog posts:", error);
    return [];
  }
}

export default async function BlogListPage() {
  const posts = await getPublishedPosts();
  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Blog' },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <Breadcrumbs items={breadcrumbItems} />
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-headline font-bold text-foreground">Our Blog</h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
          Tips, guides, and updates from the Wecanfix team to help you with your home needs.
        </p>
      </div>
      
      {posts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {posts.map((post, index) => (
            <BlogPostCard key={post.id} post={post} priority={index < 3} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-muted-foreground">No blog posts have been published yet. Check back soon!</p>
        </div>
      )}
    </div>
  );
}
