
"use client";

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlusCircle, Edit, Trash2, Layers, Loader2, PackageSearch } from "lucide-react"; // Added PackageSearch
import type { FirestoreSubCategory, FirestoreCategory } from '@/types/firestore';
import SubCategoryForm from '@/components/admin/SubCategoryForm';
import { getOverriddenCategoryName } from '@/lib/adminDataOverrides';
import { db, storage } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, orderBy, query, Timestamp, where } from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { useToast } from "@/hooks/use-toast";
import { getIconComponent } from '@/lib/iconMap';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton'; // Added Skeleton

const generateSlug = (name: string) => {
  if (!name) return "";
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

const isFirebaseStorageUrl = (url: string): boolean => {
  if (!url) return false;
  return typeof url === 'string' && url.includes("firebasestorage.googleapis.com");
};

interface GroupedSubCategoryData extends FirestoreCategory {
  subCategories: FirestoreSubCategory[];
}

export default function AdminSubCategoriesPage() {
  const [subCategories, setSubCategories] = useState<FirestoreSubCategory[]>([]);
  const [parentCategories, setParentCategories] = useState<FirestoreCategory[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSubCategory, setEditingSubCategory] = useState<FirestoreSubCategory | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();

  const subCategoriesCollectionRef = collection(db, "adminSubCategories");
  const categoriesCollectionRef = collection(db, "adminCategories");

  const fetchData = async () => {
    setIsLoadingData(true);
    try {
      const catQuery = query(categoriesCollectionRef, orderBy("order", "asc"));
      const catDataPromise = getDocs(catQuery);

      const subCatQuery = query(subCategoriesCollectionRef, orderBy("order", "asc"));
      const subCatDataPromise = getDocs(subCatQuery);

      const [catData, subCatData] = await Promise.all([catDataPromise, subCatDataPromise]);
      
      const fetchedCategories = catData.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreCategory));
      setParentCategories(fetchedCategories);

      const fetchedSubCategories = subCatData.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreSubCategory));
      setSubCategories(fetchedSubCategories);

    } catch (error) {
      console.error("Error fetching data: ", error);
      toast({
        title: "Error",
        description: "Could not fetch categories or sub-categories.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !isMounted) return;
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'fixbroCategoryNameOverrides') {
        fetchData(); // Re-fetch all data if category names might have changed
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [isMounted]);


  const handleAddSubCategory = () => {
    setEditingSubCategory(null);
    setIsFormOpen(true);
  };

  const handleEditSubCategory = (subCategory: FirestoreSubCategory) => {
    setEditingSubCategory(subCategory);
    setIsFormOpen(true);
  };

  const handleDeleteSubCategory = async (subCategoryId: string) => {
    setIsSubmitting(true);
    try {
      const subCategoryDocRef = doc(db, "adminSubCategories", subCategoryId);
      const subCategorySnap = await getDoc(subCategoryDocRef);
      const subCategoryData = subCategorySnap.data() as FirestoreSubCategory | undefined;

      if (subCategoryData?.imageUrl && isFirebaseStorageUrl(subCategoryData.imageUrl)) {
        try {
          const imageToDeleteRef = storageRef(storage, subCategoryData.imageUrl);
          await deleteObject(imageToDeleteRef);
        } catch (imgError: any) {
          console.warn("Error deleting image from Firebase Storage during sub-category delete:", imgError);
        }
      }
      await deleteDoc(subCategoryDocRef);
      setSubCategories(prev => prev.filter(sub => sub.id !== subCategoryId)); // Update local state
      toast({ title: "Success", description: "Sub-category deleted successfully." });
    } catch (error) {
      console.error("Error deleting sub-category: ", error);
      toast({ title: "Error", description: "Could not delete sub-category.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: Omit<FirestoreSubCategory, 'id' | 'createdAt'> & { id?: string, slug?: string }) => {
    setIsSubmitting(true);
    let finalSlugForSave = "";
    const baseNameSlug = generateSlug(data.name);

    if (editingSubCategory && data.id) { 
      finalSlugForSave = editingSubCategory.slug;
    } else { 
      const wasSlugManuallyEntered = !!data.slug && data.slug.trim() !== "";
      let slugToCheck = wasSlugManuallyEntered ? data.slug!.trim() : baseNameSlug;
      if (!slugToCheck && !baseNameSlug) {
        toast({ title: "Invalid Name", description: "Sub-category name must be valid to generate a slug.", variant: "destructive" });
        setIsSubmitting(false); return;
      }
      if (!slugToCheck) slugToCheck = baseNameSlug;
      let isUnique = false; let attempt = 0;
      const originalSlugToIterate = wasSlugManuallyEntered ? slugToCheck : baseNameSlug;
      while (!isUnique) {
        const q = query(subCategoriesCollectionRef, where("slug", "==", slugToCheck), where("parentId", "==", data.parentId));
        const snapshot = await getDocs(q);
        if (snapshot.empty) { isUnique = true; finalSlugForSave = slugToCheck; } 
        else {
          if (wasSlugManuallyEntered && attempt === 0) { toast({ title: "Slug Exists", description: `The slug "${slugToCheck}" is already in use for this parent category. Please choose another.`, variant: "destructive" }); setIsSubmitting(false); return; }
          attempt++; slugToCheck = `${baseNameSlug}-${attempt + 1}`;
        }
      }
    }
    const payloadForFirestore: Omit<FirestoreSubCategory, 'id' | 'createdAt'> = {
      name: data.name, slug: finalSlugForSave, parentId: data.parentId, order: Number(data.order),
      imageUrl: data.imageUrl || "", imageHint: data.imageHint || "",
      h1_title: data.h1_title || undefined, seo_title: data.seo_title || undefined,
      seo_description: data.seo_description || undefined, seo_keywords: data.seo_keywords || undefined,
    };
    try {
      if (editingSubCategory && data.id) {
        const subCategoryDoc = doc(db, "adminSubCategories", data.id);
        await updateDoc(subCategoryDoc, { ...payloadForFirestore, updatedAt: Timestamp.now() } as any);
        toast({ title: "Success", description: "Sub-category updated successfully." });
      } else {
        await addDoc(subCategoriesCollectionRef, { ...payloadForFirestore, createdAt: Timestamp.now() });
        toast({ title: "Success", description: "Sub-category added successfully." });
      }
      setIsFormOpen(false); setEditingSubCategory(null); await fetchData();
    } catch (error) {
      console.error("Error saving sub-category: ", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save sub-category.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const groupedSubCategories = useMemo(() => {
    if (!parentCategories.length) return [];
    return parentCategories
      .map(parent => ({
        ...parent,
        subCategories: subCategories
          .filter(sub => sub.parentId === parent.id)
          .sort((a, b) => a.order - b.order)
      }))
      .sort((a, b) => a.order - b.order); // Sort parent categories by their order
  }, [parentCategories, subCategories]);

  if (!isMounted) {
     return (
      <div className="space-y-6">
        <Card><CardHeader><CardTitle className="animate-pulse h-8 w-1/2 bg-muted rounded"></CardTitle><CardDescription className="animate-pulse h-4 w-3/4 bg-muted rounded mt-2"></CardDescription></CardHeader>
          <CardContent><Skeleton className="h-64 w-full" /></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-2xl flex items-center"><Layers className="mr-2 h-6 w-6 text-primary" /> Manage Sub-Categories</CardTitle>
            <CardDescription>Add, edit, or delete service sub-categories. Manage images and SEO fields.</CardDescription>
          </div>
          <Button onClick={handleAddSubCategory} disabled={isSubmitting || isLoadingData || parentCategories.length === 0} className="w-full sm:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Sub-Category
          </Button>
        </CardHeader>
      </Card>

      {isLoadingData ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-2">Loading data...</p>
        </div>
      ) : parentCategories.length === 0 ? (
        <Card><CardContent className="pt-6 text-center text-muted-foreground py-10">No parent categories found. Please add parent categories first to create sub-categories under them.</CardContent></Card>
      ) : groupedSubCategories.every(group => group.subCategories.length === 0) && subCategories.length === 0 ? (
         <Card><CardContent className="pt-6 text-center text-muted-foreground py-10">No sub-categories found yet. Add one to get started.</CardContent></Card>
      ) : (
        groupedSubCategories.map((group) => (
          <Card key={group.id} className="mb-6">
            <CardHeader>
              <CardTitle className="text-xl text-primary/90">{getOverriddenCategoryName(group.id, group.name)}</CardTitle>
            </CardHeader>
            <CardContent>
              {group.subCategories.length === 0 ? (
                <p className="text-muted-foreground text-sm pl-1">No sub-categories under {getOverriddenCategoryName(group.id, group.name)}.</p>
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
                    {group.subCategories.map((subCategory) => {
                      const IconComponent = getIconComponent(undefined);
                      return (
                        <TableRow key={subCategory.id}>
                          <TableCell>
                            {subCategory.imageUrl ? (
                              <div className="w-10 h-10 relative rounded-md overflow-hidden">
                                <Image src={subCategory.imageUrl} alt={subCategory.name} fill sizes="40px" className="object-cover" data-ai-hint={subCategory.imageHint || "sub-category"}/>
                              </div>
                            ) : ( <IconComponent className="h-6 w-6 text-muted-foreground" /> )}
                          </TableCell>
                          <TableCell className="font-medium">{subCategory.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{subCategory.slug}</TableCell>
                          <TableCell className="text-xs max-w-xs truncate" title={subCategory.h1_title}>{subCategory.h1_title || "Not set"}</TableCell>
                          <TableCell className="text-center">{subCategory.order}</TableCell>
                          <TableCell>
                            <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                              <Button variant="outline" size="icon" onClick={() => handleEditSubCategory(subCategory)} disabled={isSubmitting}><Edit className="h-4 w-4" /></Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild><Button variant="destructive" size="icon" disabled={isSubmitting}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete "{subCategory.name}".</AlertDialogDescription></AlertDialogHeader>
                                  <AlertDialogFooter><AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteSubCategory(subCategory.id)} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingSubCategory(null); } }}>
        <DialogContent className="w-full max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader><DialogTitle>{editingSubCategory ? 'Edit Sub-Category' : 'Add New Sub-Category'}</DialogTitle><DialogDescription>{editingSubCategory ? 'Update details.' : 'Fill in details.'}</DialogDescription></DialogHeader>
          {parentCategories.length === 0 && !isLoadingData ? (
             <div className="py-8 text-center"><p className="text-destructive">Cannot add sub-categories: no parent categories exist.</p><p className="text-muted-foreground text-sm mt-2">Add at least one category first.</p></div>
          ) : (
            <SubCategoryForm onSubmit={handleFormSubmit} initialData={editingSubCategory} parentCategories={parentCategories} onCancel={() => { setIsFormOpen(false); setEditingSubCategory(null); }} isSubmitting={isSubmitting}/>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

    