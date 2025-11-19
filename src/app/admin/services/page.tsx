
"use client";

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PlusCircle, Edit, Trash2, ShoppingBag, CheckCircle, XCircle, Loader2, Percent, PackageSearch } from "lucide-react";
import type { FirestoreService, FirestoreSubCategory, FirestoreTax, FirestoreCategory, PriceVariant } from '@/types/firestore';
import ServiceForm from '@/components/admin/ServiceForm';
import { db, storage } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, orderBy, query, Timestamp, where } from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { useToast } from "@/hooks/use-toast";
import { getIconComponent } from '@/lib/iconMap';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton';

const generateSlug = (name: string) => {
  if (!name) return "";
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

const isFirebaseStorageUrl = (url: string): boolean => {
  if (!url) return false;
  return typeof url === 'string' && url.includes("firebasestorage.googleapis.com");
};

interface SubCategoryGroupForServices {
  id: string;
  name: string;
  slug: string; // SubCategory data
  services: FirestoreService[];
}
interface ParentCategoryGroupForServices {
  id: string;
  name: string;
  slug: string; // Parent category data
  subCategories: SubCategoryGroupForServices[];
}


export default function AdminServicesPage() {
  const [services, setServices] = useState<FirestoreService[]>([]);
  const [parentCategories, setParentCategories] = useState<FirestoreCategory[]>([]);
  const [subCategories, setSubCategories] = useState<FirestoreSubCategory[]>([]);
  const [taxes, setTaxes] = useState<FirestoreTax[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<FirestoreService | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true); // Combined loading state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();

  const servicesCollectionRef = collection(db, "adminServices");
  const categoriesCollectionRef = collection(db, "adminCategories");
  const subCategoriesCollectionRef = collection(db, "adminSubCategories");
  const taxesCollectionRef = collection(db, "adminTaxes");

  const fetchData = async () => {
    setIsLoadingData(true);
    try {
      const catQuery = query(categoriesCollectionRef, orderBy("order", "asc"));
      const subCatQuery = query(subCategoriesCollectionRef, orderBy("order", "asc"));
      const serviceQuery = query(servicesCollectionRef, orderBy("name", "asc"));
      const taxQuery = query(taxesCollectionRef, where("isActive", "==", true), orderBy("taxName", "asc"));

      const [catData, subCatData, serviceData, taxData] = await Promise.all([
        getDocs(catQuery), getDocs(subCatQuery), getDocs(serviceQuery), getDocs(taxQuery)
      ]);
      
      setParentCategories(catData.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreCategory)));
      setSubCategories(subCatData.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreSubCategory)));
      setServices(serviceData.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreService)));
      setTaxes(taxData.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreTax)));

    } catch (error) {
      console.error("Error fetching prerequisite data: ", error);
      toast({
        title: "Error",
        description: "Could not fetch required data for services.",
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

  const handleAddService = () => {
    setEditingService(null);
    setIsFormOpen(true);
  };

  const handleEditService = (service: FirestoreService) => {
    setEditingService(service);
    setIsFormOpen(true);
  };

  const handleDeleteService = async (serviceId: string) => {
    setIsSubmitting(true);
    try {
      const serviceDocRef = doc(db, "adminServices", serviceId);
      const serviceSnap = await getDoc(serviceDocRef);
      const serviceData = serviceSnap.data() as FirestoreService | undefined;

      if (serviceData?.imageUrl && isFirebaseStorageUrl(serviceData.imageUrl)) {
        try {
          const imageToDeleteRef = storageRef(storage, serviceData.imageUrl);
          await deleteObject(imageToDeleteRef);
        } catch (imgError: any) { console.warn("Error deleting image: ", imgError); }
      }
      await deleteDoc(serviceDocRef);
      setServices(prev => prev.filter(serv => serv.id !== serviceId));
      toast({ title: "Success", description: "Service deleted successfully." });
    } catch (error) {
      console.error("Error deleting service: ", error);
      toast({ title: "Error", description: "Could not delete service.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: Omit<FirestoreService, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    setIsSubmitting(true);
    let finalSlugForSave = data.slug || generateSlug(data.name);
    const selectedTax = taxes.find(t => t.id === data.taxId);

    if (!editingService?.id) {
        let slugToCheck = finalSlugForSave;
        if (!slugToCheck) { toast({ title: "Invalid Name/Slug", variant: "destructive" }); setIsSubmitting(false); return; }
        const wasSlugManuallyEntered = !!data.slug; let attempt = 0; const baseSlugFromName = generateSlug(data.name); 
        while (true) {
            const q = query(servicesCollectionRef, where("slug", "==", slugToCheck), where("subCategoryId", "==", data.subCategoryId));
            const snapshot = await getDocs(q);
            if (snapshot.empty) { finalSlugForSave = slugToCheck; break; } 
            else {
                if (wasSlugManuallyEntered && attempt === 0) { toast({ title: "Slug Exists", description: `Slug "${slugToCheck}" already in use for this sub-category.`, variant: "destructive" }); setIsSubmitting(false); return; }
                attempt++; slugToCheck = `${baseSlugFromName}-${attempt + 1}`; 
            }
        }
    } else { finalSlugForSave = editingService!.slug; }
    
    // This is the complete payload with all fields, including the price variations.
    const payloadForFirestore: Partial<FirestoreService> = {
      name: data.name, 
      slug: finalSlugForSave, 
      subCategoryId: data.subCategoryId, 
      description: data.description,
      price: data.price,
      isTaxInclusive: data.isTaxInclusive, 
      discountedPrice: data.discountedPrice === null ? undefined : data.discountedPrice,
      hasPriceVariants: data.hasPriceVariants,
      priceVariants: data.priceVariants,
      rating: Number(data.rating || 0), 
      reviewCount: Number(data.reviewCount || 0),
      maxQuantity: data.maxQuantity === null ? undefined : Number(data.maxQuantity),
      isActive: data.isActive === undefined ? true : data.isActive,
      imageUrl: data.imageUrl || "", 
      imageHint: data.imageHint || "", 
      shortDescription: data.shortDescription === null ? undefined : data.shortDescription,
      fullDescription: data.fullDescription === null ? undefined : data.fullDescription, 
      serviceHighlights: data.serviceHighlights || [],
      taxId: data.taxId, 
      taxName: selectedTax?.taxName, 
      taxPercent: selectedTax?.taxPercent,
      h1_title: data.h1_title || undefined, 
      seo_title: data.seo_title || undefined,
      seo_description: data.seo_description || undefined, 
      seo_keywords: data.seo_keywords || undefined,
      taskTimeValue: data.taskTimeValue,
      taskTimeUnit: data.taskTimeUnit,
      includedItems: data.includedItems || [],
      excludedItems: data.excludedItems || [],
      allowPayLater: data.allowPayLater,
      serviceFaqs: data.serviceFaqs || [],
      membersRequired: data.membersRequired,
    };

    try {
      if (data.id) { // Editing existing service
        const serviceDoc = doc(db, "adminServices", data.id);
        const updateData = { ...payloadForFirestore, updatedAt: Timestamp.now() };
        delete (updateData as any).id; // Ensure 'id' isn't part of the update payload itself
        await updateDoc(serviceDoc, updateData);
        toast({ title: "Success", description: "Service updated successfully." });
      } else { // Adding new service
        const newServicePayload = { ...payloadForFirestore, createdAt: Timestamp.now() };
        await addDoc(servicesCollectionRef, newServicePayload as FirestoreService); // Cast to ensure type compatibility for addDoc
        toast({ title: "Success", description: "Service added successfully." });
      }
      setIsFormOpen(false); setEditingService(null); await fetchData();
    } catch (error) {
      console.error("Error saving service: ", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save service.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const groupedServices = useMemo(() => {
    if (!parentCategories.length) return [];
    return parentCategories
      .map(parent => {
        const relevantSubCategories = subCategories
          .filter(sub => sub.parentId === parent.id)
          .sort((a, b) => a.order - b.order);

        const subCategoriesWithTheirServices = relevantSubCategories.map(subCat => {
          const servicesForSubCat = services
            .filter(service => service.subCategoryId === subCat.id)
            .sort((a, b) => a.name.localeCompare(b.name));
          return { ...subCat, services: servicesForSubCat };
        });
        return { ...parent, subCategories: subCategoriesWithTheirServices };
      })
      .sort((a,b) => a.order - b.order);
  }, [parentCategories, subCategories, services]);


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
            <CardTitle className="text-2xl flex items-center"><ShoppingBag className="mr-2 h-6 w-6 text-primary" /> Manage Services</CardTitle>
            <CardDescription>Add, edit, or delete services. Grouped by category and sub-category.</CardDescription>
          </div>
          <Button onClick={handleAddService} disabled={isSubmitting || isLoadingData || parentCategories.length === 0 || subCategories.length === 0} className="w-full sm:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Service
          </Button>
        </CardHeader>
      </Card>

      {isLoadingData ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-2">Loading all service data...</p>
        </div>
      ) : parentCategories.length === 0 ? (
          <Card><CardContent className="pt-6 text-center text-muted-foreground py-10">Please add parent categories first to organize services.</CardContent></Card>
      ) : groupedServices.every(pg => pg.subCategories.every(sg => sg.services.length === 0)) && services.length === 0 ? (
           <Card><CardContent className="pt-6 text-center text-muted-foreground py-10">No services found. Add one to get started.</CardContent></Card>
      ) : (
        <Accordion type="multiple" className="w-full space-y-4">
          {groupedServices.map((parentGroup) => (
            (parentGroup.subCategories.length > 0 || services.some(s => parentCategories.find(pc => pc.id === subCategories.find(sc => sc.id === s.subCategoryId)?.parentId)?.id === parentGroup.id)) && (
            <AccordionItem value={parentGroup.id} key={parentGroup.id} className="border rounded-lg bg-card shadow-sm">
              <AccordionTrigger className="px-6 py-4 text-lg font-semibold hover:no-underline">
                {parentGroup.name}
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6 pt-0 space-y-4">
                {parentGroup.subCategories.length === 0 && (<p className="text-sm text-muted-foreground pl-1">No sub-categories under {parentGroup.name}.</p>)}
                {parentGroup.subCategories.map((subCatGroup) => (
                  (subCatGroup.services.length > 0) && (
                  <div key={subCatGroup.id} className="pt-2">
                    <h4 className="text-md font-medium text-primary/80 mb-3 border-b pb-2">{subCatGroup.name}</h4>
                    {subCatGroup.services.length === 0 ? (
                      <p className="text-xs text-muted-foreground pl-1">No services under {subCatGroup.name}.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50px] p-2">Img</TableHead>
                            <TableHead className="p-2">Name</TableHead>
                            <TableHead className="p-2">Slug</TableHead>
                            <TableHead className="text-right p-2">Price (₹)</TableHead>
                            <TableHead className="text-right p-2">Tax</TableHead>
                            <TableHead className="text-center p-2">Active</TableHead>
                            <TableHead className="text-right min-w-[100px] p-2">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {subCatGroup.services.map((service) => {
                            const IconComponent = getIconComponent(undefined);
                            return (
                              <TableRow key={service.id}
                                ><TableCell className="p-2"
                                  >{service.imageUrl ? (<div className="w-8 h-8 relative rounded-sm overflow-hidden"><Image src={service.imageUrl} alt={service.name} fill sizes="32px" className="object-cover" data-ai-hint={service.imageHint || "service"}/></div>) 
                                  : ( <IconComponent className="h-5 w-5 text-muted-foreground" /> )}</TableCell
                                ><TableCell className="font-medium p-2 text-xs"
                                  >{service.name}</TableCell
                                ><TableCell className="p-2 text-xs text-muted-foreground"
                                  >{service.slug}</TableCell
                                ><TableCell className="text-right p-2 text-xs"
                                  >{service.price.toLocaleString()}</TableCell
                                ><TableCell className="text-right p-2 text-xs"
                                  >{service.taxName ? `${service.taxName} (${service.taxPercent}%)` : 'N/A'}</TableCell
                                ><TableCell className="text-center p-2"
                                  >{service.isActive ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" /> : <XCircle className="h-4 w-4 text-red-500 mx-auto" />}</TableCell
                                ><TableCell className="p-2"
                                  ><div className="flex items-center justify-end gap-1"
                                    ><Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleEditService(service)} disabled={isSubmitting}><Edit className="h-3.5 w-3.5" /></Button
                                    ><AlertDialog
                                      ><AlertDialogTrigger asChild><Button variant="destructive" size="icon" className="h-7 w-7" disabled={isSubmitting}><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger
                                      ><AlertDialogContent
                                        ><AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete "{service.name}".</AlertDialogDescription></AlertDialogHeader
                                        ><AlertDialogFooter><AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteService(service.id)} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete</AlertDialogAction></AlertDialogFooter
                                      ></AlertDialogContent
                                    ></AlertDialog
                                  ></div
                                ></TableCell
                              ></TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                  )
                ))}
                 {parentGroup.subCategories.every(sg => sg.services.length === 0) && (<p className="text-sm text-muted-foreground pl-1 mt-2">No services found under any sub-category of {parentGroup.name}.</p>)}
              </AccordionContent>
            </AccordionItem>
            )
          ))}
        </Accordion>
      )}

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingService(null); } }}>
        <DialogContent className="w-full max-w-xs sm:max-w-md md:max-w-lg lg:max-w-2xl max-h-[90vh] p-0 flex flex-col">
          <DialogHeader className="p-6 pb-4 border-b"><DialogTitle>{editingService ? 'Edit Service' : 'Add New Service'}</DialogTitle><DialogDescription>{editingService ? 'Update details.' : 'Fill in details for a new service.'}</DialogDescription></DialogHeader>
          {(parentCategories.length === 0 && !editingService && !isLoadingData) || (subCategories.length === 0 && !editingService && !isLoadingData) ? (
             <div className="p-6 py-8 text-center"><p className="text-destructive">{(parentCategories.length === 0 && "No parent categories exist. ")}{(subCategories.length === 0 && "No sub-categories exist. ")}</p><p className="text-muted-foreground text-sm mt-2">Please add categories/sub-categories first.</p></div>
          ) : (
            <ServiceForm onSubmit={handleFormSubmit} initialData={editingService} parentCategories={parentCategories} subCategories={subCategories} taxes={taxes} onCancel={() => { setIsFormOpen(false); setEditingService(null); }} isSubmitting={isSubmitting}/>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

    