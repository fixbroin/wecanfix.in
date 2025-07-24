
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlusCircle, Edit, Trash2, Loader2, List } from "lucide-react";
import Image from 'next/image';
import type { FirestoreCategory } from '@/types/firestore';
import CategoryForm from '@/components/admin/CategoryForm';
import { setCategoryNameOverride, getOverriddenCategoryName } from '@/lib/adminDataOverrides';
import { db, storage } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query, Timestamp, getDoc, where } from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { useToast } from "@/hooks/use-toast";
import { getIconComponent } from '@/lib/iconMap';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";



const generateSlug = (name: string) => {
  if (!name) return "";
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

const isFirebaseStorageUrl = (url: string): boolean => {
  if (!url) return false;
  return typeof url === 'string' && url.includes("firebasestorage.googleapis.com");
};


export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<FirestoreCategory[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<FirestoreCategory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false); 
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();

  const categoriesCollectionRef = collection(db, "adminCategories");

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const q = query(categoriesCollectionRef, orderBy("order", "asc"));
      const data = await getDocs(q);
      const fetchedCategories = data.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreCategory));
      setCategories(fetchedCategories);
    } catch (error) {
      console.error("Error fetching categories: ", error);
      toast({
        title: "Error",
        description: "Could not fetch categories from Firestore.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchCategories();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !isMounted) return;
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'fixbroCategoryNameOverrides') {
        setCategories(prevCategories =>
          prevCategories.map(cat => ({
            ...cat,
          }))
        );
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [isMounted]);

  const handleAddCategory = () => {
    setEditingCategory(null);
    setIsFormOpen(true);
  };

  const handleEditCategory = (category: FirestoreCategory) => {
    setEditingCategory(category);
    setIsFormOpen(true);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    setIsSubmitting(true); 
    try {
      const categoryDocRef = doc(db, "adminCategories", categoryId);
      const categorySnap = await getDoc(categoryDocRef);
      const categoryData = categorySnap.data() as FirestoreCategory | undefined;

      if (categoryData?.imageUrl && isFirebaseStorageUrl(categoryData.imageUrl)) {
        try {
          const imageToDeleteRef = storageRef(storage, categoryData.imageUrl);
          await deleteObject(imageToDeleteRef);
          toast({ title: "Image Deleted", description: "Associated image removed from storage." });
        } catch (imgError: any) {
          console.warn("Error deleting image from Firebase Storage during category delete:", imgError);
          toast({ title: "Image Deletion Warning", description: `Category will be deleted, but failed to remove image from storage: ${imgError.message}`, variant: "default", duration: 7000 });
        }
      }

      await deleteDoc(categoryDocRef);

      setCategories(categories.filter(cat => cat.id !== categoryId));
      toast({ title: "Success", description: "Category deleted successfully." });
    } catch (error) {
      console.error("Error deleting category: ", error);
      toast({ title: "Error", description: "Could not delete category.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: Omit<FirestoreCategory, 'id' | 'createdAt'> & { id?: string, slug?: string }) => {
    setIsSubmitting(true);

    let finalSlugForSave = "";
    const baseNameSlug = generateSlug(data.name);

    if (editingCategory && data.id) { // Editing existing category
      finalSlugForSave = editingCategory.slug; // Slug is non-editable for existing items
    } else { // Creating a new category
      const wasSlugManuallyEntered = !!data.slug && data.slug.trim() !== "";
      let slugToCheck = wasSlugManuallyEntered ? data.slug!.trim() : baseNameSlug;

      if (!slugToCheck && !baseNameSlug) { // Handle cases where name might produce empty slug
        toast({ title: "Invalid Name", description: "Category name must be valid to generate a slug.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
      if (!slugToCheck) slugToCheck = baseNameSlug;


      let isUnique = false;
      let attempt = 0;
      const originalSlugToIterate = wasSlugManuallyEntered ? slugToCheck : baseNameSlug; // Use manually entered slug for first check, then base name slug for iterations

      while (!isUnique) {
        const q = query(categoriesCollectionRef, where("slug", "==", slugToCheck));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          isUnique = true;
          finalSlugForSave = slugToCheck;
        } else {
          if (wasSlugManuallyEntered && attempt === 0) { 
            toast({ title: "Slug Exists", description: `The slug "${slugToCheck}" is already in use. Please choose another.`, variant: "destructive" });
            setIsSubmitting(false);
            return; 
          }
          attempt++;
          slugToCheck = `${baseNameSlug}-${attempt + 1}`; // Always iterate from the base name slug + counter
        }
      }
    }

    const payloadForFirestore: Omit<FirestoreCategory, 'id' | 'createdAt'> = {
      name: data.name,
      slug: finalSlugForSave,
      order: Number(data.order),
      imageUrl: data.imageUrl || "",
      imageHint: data.imageHint || "",
      h1_title: data.h1_title || undefined,
      seo_title: data.seo_title || undefined,
      seo_description: data.seo_description || undefined,
      seo_keywords: data.seo_keywords || undefined,
    };

    try {
      if (editingCategory && data.id) {
        const categoryDoc = doc(db, "adminCategories", data.id);
        await updateDoc(categoryDoc, { ...payloadForFirestore, updatedAt: Timestamp.now() } as any);
        setCategoryNameOverride(data.id, data.name);
        toast({ title: "Success", description: "Category updated successfully." });
      } else {
        const docRef = await addDoc(categoriesCollectionRef, { ...payloadForFirestore, createdAt: Timestamp.now() });
        setCategoryNameOverride(docRef.id, payloadForFirestore.name);
        toast({ title: "Success", description: "Category added successfully." });
      }
      setIsFormOpen(false);
      setEditingCategory(null);
      await fetchCategories();
    } catch (error) {
      console.error("Error saving category: ", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save category.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isMounted) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center"><List className="mr-2 h-6 w-6 text-primary" />Manage Categories</CardTitle>
              <CardDescription>Loading categories...</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="animate-pulse h-10 bg-muted rounded w-full"></div>
            <div className="animate-pulse h-20 bg-muted rounded w-full mt-4"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-2xl flex items-center"><List className="mr-2 h-6 w-6 text-primary" />Manage Categories</CardTitle>
            <CardDescription>Add, edit, or delete service categories from Firestore.</CardDescription>
          </div>
          <Button onClick={handleAddCategory} disabled={isSubmitting || isLoading} className="w-full sm:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Category
          </Button>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading categories...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Image</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>H1 Title</TableHead>
                  <TableHead className="text-center">Order</TableHead>
                  <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                      No categories found. Add one to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  categories.map((category) => {
                    const IconComponent = getIconComponent(undefined); 
                    return (
                      <TableRow key={category.id}>
                        <TableCell>
                          {category.imageUrl ? (
                             <div className="w-10 h-10 relative rounded-md overflow-hidden">
                                <Image
                                  src={category.imageUrl}
                                  alt={category.name}
                                  fill
                                  sizes="40px"
                                  className="object-cover"
                                  data-ai-hint={category.imageHint || "category"}
                                />
                              </div>
                          ) : (
                            <IconComponent className="h-6 w-6 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{getOverriddenCategoryName(category.id, category.name)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{category.slug}</TableCell>
                        <TableCell className="text-xs max-w-xs truncate" title={category.h1_title}>{category.h1_title || "Not set"}</TableCell>
                        <TableCell className="text-center">{category.order}</TableCell>
                        <TableCell>
                          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                            <Button variant="outline" size="icon" onClick={() => handleEditCategory(category)} disabled={isSubmitting}>
                              <Edit className="h-4 w-4" />
                              <span className="sr-only">Edit</span>
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="icon" disabled={isSubmitting}>
                                  <Trash2 className="h-4 w-4" />
                                  <span className="sr-only">Delete</span>
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete the category
                                    {category.imageUrl && isFirebaseStorageUrl(category.imageUrl) ? " and its associated image from storage." : "."}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteCategory(category.id)}
                                    disabled={isSubmitting}
                                    className="bg-destructive hover:bg-destructive/90"
                                  >
                                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingCategory(null); } }}>
        <DialogContent className="w-full max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit Category' : 'Add New Category'}</DialogTitle>
            <DialogDescription>
              {editingCategory ? 'Update the details for this category.' : 'Fill in the details to create a new category.'}
            </DialogDescription>
          </DialogHeader>
          <CategoryForm
            onSubmit={handleFormSubmit}
            initialData={editingCategory}
            onCancel={() => {
              setIsFormOpen(false);
              setEditingCategory(null);
            }}
            isSubmitting={isSubmitting}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
    
