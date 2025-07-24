
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"; // Added CardFooter
import { Loader2, Star, PackageSearch, Filter } from "lucide-react";
import type { FirestoreReview, FirestoreBooking } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, getDocs, collectionGroup } from "firebase/firestore";
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const formatReviewTimestamp = (timestamp?: any): string => {
  if (!timestamp) return 'N/A';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return formatDistanceToNow(date, { addSuffix: true });
};

export default function ProviderMyReviewsPage() {
  const { user: providerUser, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();
  const [reviews, setReviews] = useState<FirestoreReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterRating, setFilterRating] = useState<number | "all">("all"); // "all" or 1-5

  useEffect(() => {
    if (!providerUser || authIsLoading) {
      if (!authIsLoading && !providerUser) setIsLoading(false);
      return;
    }
    setIsLoading(true);
    
    // 1. Fetch all bookings assigned to this provider
    const bookingsQuery = query(
      collectionGroup(db, "bookings"), 
      where("providerId", "==", providerUser.uid),
      where("status", "==", "Completed") // Only for completed bookings
    );

    const unsubscribeBookings = onSnapshot(bookingsQuery, async (bookingsSnapshot) => {
      if (bookingsSnapshot.empty) {
        setReviews([]);
        setIsLoading(false);
        return;
      }
      
      const providerBookingIds = bookingsSnapshot.docs.map(doc => doc.data().bookingId as string);

      if (providerBookingIds.length === 0) {
        setReviews([]);
        setIsLoading(false);
        return;
      }
      
      // 2. Fetch reviews for those booking IDs
      // Firestore 'in' queries are limited to 30 items per query. Handle chunking if necessary.
      // For simplicity, assuming less than 30 bookings for now or handle chunking if this becomes an issue.
      // If providerBookingIds can exceed 30, this part needs to be refactored to batch the 'in' query.
      const CHUNK_SIZE = 30;
      const reviewPromises = [];

      for (let i = 0; i < providerBookingIds.length; i += CHUNK_SIZE) {
        const chunk = providerBookingIds.slice(i, i + CHUNK_SIZE);
        if (chunk.length > 0) {
          const reviewsQuery = query(
            collection(db, "adminReviews"),
            where("bookingId", "in", chunk),
            where("status", "==", "Approved"),
            orderBy("createdAt", "desc")
          );
          reviewPromises.push(getDocs(reviewsQuery));
        }
      }
      
      try {
        const reviewSnapshotsArray = await Promise.all(reviewPromises);
        const fetchedReviews: FirestoreReview[] = [];
        reviewSnapshotsArray.forEach(snapshot => {
          snapshot.docs.forEach(doc => fetchedReviews.push({ ...doc.data(), id: doc.id } as FirestoreReview));
        });
        // Additional client-side sort if multiple chunks were fetched, though orderBy in query helps.
        fetchedReviews.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        setReviews(fetchedReviews);
      } catch (error) {
         console.error("Error fetching provider reviews:", error);
         toast({ title: "Error", description: "Could not fetch your reviews.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }

    }, (error) => {
      console.error("Error fetching provider bookings for reviews:", error);
      toast({ title: "Error", description: "Could not fetch data for reviews.", variant: "destructive" });
      setIsLoading(false);
    });

    return () => unsubscribeBookings();
  }, [providerUser, authIsLoading, toast]);

  const filteredReviews = useMemo(() => {
    if (filterRating === "all") return reviews;
    return reviews.filter(r => r.rating === filterRating);
  }, [reviews, filterRating]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
    return (totalRating / reviews.length);
  }, [reviews]);


  if (authIsLoading || isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div>
                <CardTitle className="text-2xl flex items-center"><Star className="mr-2 h-6 w-6 text-yellow-400 fill-yellow-400"/>My Customer Reviews</CardTitle>
                <CardDescription>Feedback from customers on your completed jobs.</CardDescription>
            </div>
            {reviews.length > 0 && (
                 <div className="text-lg font-semibold flex items-center mt-2 sm:mt-0">
                    Average: {averageRating.toFixed(1)}
                    <Star className="ml-1 h-5 w-5 text-yellow-400 fill-yellow-400"/>
                </div>
            )}
        </CardHeader>
        <CardContent>
            {reviews.length > 0 && (
                <div className="mb-4 w-full sm:w-auto sm:max-w-xs">
                    <Select 
                        value={String(filterRating)} 
                        onValueChange={(value) => setFilterRating(value === "all" ? "all" : parseInt(value))}
                    >
                        <SelectTrigger className="h-9 text-xs">
                             <Filter className="mr-1.5 h-3.5 w-3.5"/> <SelectValue placeholder="Filter by rating" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Ratings</SelectItem>
                            {[5,4,3,2,1].map(r => <SelectItem key={r} value={String(r)}>{r} Star{r > 1 ? 's' : ''}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            )}
            {filteredReviews.length === 0 && !isLoading ? (
            <div className="text-center py-10">
                <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                    {filterRating === "all" ? "No reviews found for your completed jobs yet." : `No ${filterRating}-star reviews found.`}
                </p>
            </div>
            ) : (
            <div className="space-y-4">
                {filteredReviews.map(review => (
                <Card key={review.id} className="shadow-sm">
                    <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                            <Avatar className="h-8 w-8">
                                <AvatarImage src={review.userAvatarUrl || undefined} alt={review.userName}/>
                                <AvatarFallback>{review.userName ? review.userName[0].toUpperCase() : 'U'}</AvatarFallback>
                            </Avatar>
                            <span className="font-semibold text-sm">{review.userName}</span>
                        </div>
                        <div className="flex items-center">
                            {[...Array(5)].map((_, i) => (<Star key={i} className={`h-4 w-4 ${i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30'}`}/>))}
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">For Service: {review.serviceName} (Booking ID: {review.bookingId?.substring(0,12) || 'N/A'}...)</p>
                    </CardHeader>
                    <CardContent>
                    <p className="text-sm text-foreground/90">{review.comment}</p>
                    </CardContent>
                    <CardFooter className="text-xs text-muted-foreground">
                        {formatReviewTimestamp(review.createdAt)}
                    </CardFooter>
                </Card>
                ))}
            </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

