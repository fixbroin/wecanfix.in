
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Edit, Trash2, Loader2, Star, MessageSquare, Filter, Wand2 } from "lucide-react"; 
import type { FirestoreReview, ReviewStatus, FirestoreService, FirestoreSubCategory, FirestoreCategory } from '@/types/firestore';
import ReviewForm, { type ReviewFormData } from '@/components/admin/ReviewForm';
import BulkReviewGeneratorDialog from '@/components/admin/BulkReviewGeneratorDialog';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query, Timestamp, onSnapshot } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const reviewStatusOptions: ReviewStatus[] = ["Pending", "Approved", "Rejected", "Flagged"];

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<FirestoreReview[]>([]);
  const [services, setServices] = useState<Pick<FirestoreService, 'id' | 'name' | 'subCategoryId'>[]>([]);
  const [subCategories, setSubCategories] = useState<Pick<FirestoreSubCategory, 'id' | 'name' | 'parentId'>[]>([]);
  const [parentCategories, setParentCategories] = useState<Pick<FirestoreCategory, 'id' | 'name'>[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBulkGenerateOpen, setIsBulkGenerateOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<FirestoreReview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<ReviewStatus | "All">("All");
  const { toast } = useToast();

  useEffect(() => {
    let servicesAndCatsLoaded = false;
    let initialReviewsLoaded = false;
    
    const tryStopLoading = () => {
      if (servicesAndCatsLoaded && initialReviewsLoaded) {
        setIsLoading(false);
      }
    };
    
    const fetchPrerequisites = async () => {
        try {
            const servicesQuery = query(collection(db, "adminServices"), orderBy("name"));
            const subCatsQuery = query(collection(db, "adminSubCategories"), orderBy("name"));
            const catsQuery = query(collection(db, "adminCategories"), orderBy("name"));
            
            const [servicesSnap, subCatsSnap, catsSnap] = await Promise.all([
                getDocs(servicesQuery), getDocs(subCatsQuery), getDocs(catsQuery)
            ]);

            setServices(servicesSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name as string, subCategoryId: doc.data().subCategoryId as string })));
            setSubCategories(subCatsSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name as string, parentId: doc.data().parentId as string })));
            setParentCategories(catsSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name as string })));
        } catch (error) {
            console.error("Error fetching prerequisites for review generation:", error);
            toast({ title: "Error", description: "Could not load data for AI features.", variant: "destructive" });
        } finally {
            servicesAndCatsLoaded = true;
            tryStopLoading();
        }
    };

    const reviewsCollectionRef = collection(db, "adminReviews");
    const qReviews = query(reviewsCollectionRef, orderBy("createdAt", "desc"));
    const reviewUnsubscribe = onSnapshot(qReviews, (querySnapshot) => {
      const fetchedReviews = querySnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreReview));
      setReviews(fetchedReviews);
      initialReviewsLoaded = true;
      tryStopLoading();
    }, (error) => {
      console.error("Error fetching reviews: ", error);
      toast({ title: "Error", description: "Could not fetch reviews.", variant: "destructive" });
      initialReviewsLoaded = true;
      tryStopLoading();
    });

    fetchPrerequisites();

    return () => {
        reviewUnsubscribe();
    };
  }, [toast]);

  const filteredReviews = useMemo(() => {
    if (filterStatus === "All") {
      return reviews;
    }
    return reviews.filter(review => review.status === filterStatus);
  }, [reviews, filterStatus]);

  const handleAddReview = () => {
    setEditingReview(null);
    setIsFormOpen(true);
  };

  const handleEditReview = (review: FirestoreReview) => {
    setEditingReview(review);
    setIsFormOpen(true);
  };

  const handleDeleteReview = async (reviewId: string) => {
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, "adminReviews", reviewId));
      toast({ title: "Success", description: "Review deleted successfully." });
    } catch (error) {
      console.error("Error deleting review: ", error);
      toast({ title: "Error", description: "Could not delete review.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: ReviewFormData & { serviceName: string, adminCreated: boolean, id?: string }) => {
    setIsSubmitting(true);
    
    const payload: Omit<FirestoreReview, 'id' | 'createdAt' | 'updatedAt'> & { updatedAt?: Timestamp, createdAt?: Timestamp } = {
      serviceId: data.serviceId,
      serviceName: data.serviceName,
      userName: data.userName,
      rating: data.rating,
      comment: data.comment,
      status: data.status,
      adminCreated: data.adminCreated,
    };

    try {
      if (data.id) { 
        const reviewDoc = doc(db, "adminReviews", data.id);
        await updateDoc(reviewDoc, { ...payload, updatedAt: Timestamp.now() });
        toast({ title: "Success", description: "Review updated successfully." });
      } else { 
        await addDoc(collection(db, "adminReviews"), { ...payload, createdAt: Timestamp.now() });
        toast({ title: "Success", description: "Review added successfully." });
      }
      setIsFormOpen(false);
      setEditingReview(null);
    } catch (error) {
      console.error("Error saving review: ", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save review.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleChangeStatus = async (reviewId: string, newStatus: ReviewStatus) => {
     try {
        await updateDoc(doc(db, "adminReviews", reviewId), { status: newStatus, updatedAt: Timestamp.now()});
        toast({title: "Status Updated", description: `Review status changed to ${newStatus}.`})
     } catch (error) {
        console.error("Error updating review status:", error);
        toast({title: "Error", description: "Could not update review status.", variant: "destructive"});
     }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-2xl flex items-center"><MessageSquare className="mr-2 h-6 w-6 text-primary" />Manage Reviews</CardTitle>
            <CardDescription>Create, edit, delete, and manage the status of service reviews.</CardDescription>
          </div>
          <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2">
            <div className="w-full sm:min-w-[180px]">
                <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as ReviewStatus | "All")}>
                    <SelectTrigger className="h-9 text-xs">
                        <Filter className="mr-1.5 h-3.5 w-3.5"/>
                        <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All">All Statuses</SelectItem>
                        {reviewStatusOptions.map(status => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <Button onClick={() => setIsBulkGenerateOpen(true)} variant="outline" className="w-full sm:w-auto h-9">
                <Wand2 className="mr-2 h-4 w-4" /> AI Bulk Generate
            </Button>
            <Button onClick={handleAddReview} disabled={isSubmitting || isLoading || services.length === 0} className="w-full sm:w-auto h-9">
                <PlusCircle className="mr-2 h-4 w-4" /> Add New Review
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading reviews...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="text-center">Rating</TableHead>
                  <TableHead>Comment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReviews.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                      {filterStatus === "All" ? "No reviews found." : `No reviews found with status: ${filterStatus}.`}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReviews.map((review) => (
                    <TableRow key={review.id}>
                      <TableCell className="font-medium text-xs max-w-[150px] truncate" title={review.serviceName}>{review.serviceName}</TableCell>
                      <TableCell className="text-xs">{review.userName}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center">
                          {review.rating} <Star className="ml-1 h-3.5 w-3.5 text-yellow-400 fill-yellow-400"/>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={review.comment}>
                        {review.comment}
                      </TableCell>
                      <TableCell>
                           <Select value={review.status} onValueChange={(newStatus) => handleChangeStatus(review.id, newStatus as ReviewStatus)}>
                              <SelectTrigger className="h-8 text-xs min-w-[100px] sm:min-w-[120px]">
                                  <SelectValue placeholder="Set Status"/>
                              </SelectTrigger>
                              <SelectContent>
                                  {reviewStatusOptions.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                              </SelectContent>
                          </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                          <Button variant="outline" size="icon" onClick={() => handleEditReview(review)} disabled={isSubmitting}>
                            <Edit className="h-4 w-4" /> <span className="sr-only">Edit</span>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="icon" disabled={isSubmitting}>
                                <Trash2 className="h-4 w-4" /> <span className="sr-only">Delete</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the review by "{review.userName}" for "{review.serviceName}".
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteReview(review.id)}
                                  disabled={isSubmitting}
                                  className="bg-destructive hover:bg-destructive/90">
                                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingReview(null); } }}>
        <DialogContent className="w-[90vw] max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl max-h-[90vh] p-0 flex flex-col">
           <DialogHeader className="p-6 pb-4 border-b bg-background z-10"> {/* Removed sticky, header will scroll */}
            <DialogTitle>{editingReview ? 'Edit Review' : 'Add New Review'}</DialogTitle>
            <DialogDescription>
              {editingReview ? `Update details for review by ${editingReview.userName}.` : 'Fill in the details for a new review.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-grow overflow-y-auto"> {/* This div handles scrolling of the ReviewForm */}
            {isLoading ? (
              <div className="p-6 py-8 text-center flex justify-center items-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary"/>
                  <span className="ml-2">Loading services...</span>
              </div>
            ) : services.length === 0 && !editingReview ? (
              <div className="p-6 py-8 text-center">
                  <p className="text-destructive">Cannot add new reviews because no services exist.</p>
                  <p className="text-muted-foreground text-sm mt-2">Please add at least one service first.</p>
              </div>
            ) : (
              <ReviewForm
                  onSubmit={handleFormSubmit}
                  initialData={editingReview}
                  services={services}
                  onCancel={() => { setIsFormOpen(false); setEditingReview(null); }}
                  isSubmitting={isSubmitting}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
      <BulkReviewGeneratorDialog
        isOpen={isBulkGenerateOpen}
        onClose={() => setIsBulkGenerateOpen(false)}
        onGenerationComplete={() => { /* onSnapshot handles refresh */ }}
        services={services}
        subCategories={subCategories}
        parentCategories={parentCategories}
      />
    </div>
  );
}
