
import CategoryPageClient from '@/components/category/CategoryPageClient';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreCategory } from '@/types/firestore';
import type { BreadcrumbItem } from '@/types/ui';

interface CategoryPageProps {
  params: { slug: string };
}

// Metadata generation is handled by src/app/category/[slug]/layout.tsx

async function getCategoryDataForPage(slug: string): Promise<FirestoreCategory | null> {
  try {
    const catRef = adminDb.collection('adminCategories');
    const q = catRef.where('slug', '==', slug).limit(1);
    const snapshot = await q.get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as FirestoreCategory;
  } catch (error) {
    console.error('Error fetching category data for page component:', error);
    return null;
  }
}

export async function generateStaticParams() {
  try {
    const categoriesSnapshot = await adminDb.collection('adminCategories').get();
    const paths = categoriesSnapshot.docs
      .map(doc => {
        const categoryData = doc.data() as FirestoreCategory;
        return { slug: categoryData.slug };
      })
      .filter(p => p.slug); // Ensure slug exists and is truthy

    if (paths.length === 0) {
        console.warn("[CategoryPage] generateStaticParams: No category slugs found. This might mean no static category pages will be generated for /category/[slug] routes.");
    }
    return paths;
  } catch (error) {
    console.error("[CategoryPage] Error generating static params for /category/[slug] pages:", error);
    return []; // Return empty array on error to prevent build failure
  }
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const categoryData = await getCategoryDataForPage(slug);
  
  const breadcrumbItems: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
  if (categoryData) {
    breadcrumbItems.push({ label: categoryData.name });
  } else {
    breadcrumbItems.push({ label: "Category Not Found" });
  }

  return <CategoryPageClient categorySlug={slug} breadcrumbItems={breadcrumbItems} />;
}
