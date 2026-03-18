"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Tag, Eye, Loader2, PackageSearch, XIcon, Edit, Trash2, CalendarDays, Clock, UserCheck2, MoreHorizontal, Users, ListOrdered, ChevronDown, Search, MapPin, Phone, Mail, IndianRupee, History } from "lucide-react"; 
import type { FirestoreBooking, BookingStatus, BookingServiceItem, AppSettings, ProviderApplication, FirestoreNotification, MarketingAutomationSettings, ReferralSettings, FirestoreUser, Referral, DayAvailability } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { triggerPushNotification } from '@/lib/fcmUtils';
import { 
  collection, 
 query, orderBy, onSnapshot, doc, updateDoc, Timestamp, deleteDoc, where, getDocs, deleteField, addDoc, getDoc, runTransaction, limit, startAfter, type QueryDocumentSnapshot } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import BookingDetailsModalContent from '@/components/admin/BookingDetailsModalContent';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { generateInvoicePdf as generateInvoicePdfForDownload } from '@/lib/invoiceGenerator'; 
import { sendBookingConfirmationEmail, type BookingConfirmationEmailInput } from '@/ai/flows/sendBookingEmailFlow';
import { sendProviderBookingAssignmentEmail, type ProviderBookingAssignmentEmailInput } from '@/ai/flows/sendProviderBookingAssignmentFlow';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import { defaultAppSettings } from '@/config/appDefaults';
import AssignProviderModal from '@/components/admin/AssignProviderModal'; 
import { Badge } from '@/components/ui/badge';
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { cn } from '@/lib/utils';
import AppImage from '@/components/ui/AppImage';
import { getDashboardData, getArchivedBookings, type DashboardData } from '@/lib/adminDashboardUtils';
import { triggerRefresh } from '@/lib/revalidateUtils';

const statusOptions: BookingStatus[] = [
  "Pending Payment", "Confirmed", "AssignedToProvider", "ProviderAccepted", 
  "ProviderRejected", "InProgressByProvider", "Processing", "Completed", "Cancelled", "Rescheduled"
];

const formatDateForDisplay = (dateString: string | undefined): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString.replace(/-/g, '/')); 
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
        return dateString;
    }
};

const getStatusBadgeVariant = (status: BookingStatus) => {
    switch (status) {
      case 'Completed': return 'default';
      case 'Confirmed':
      case 'ProviderAccepted':
      case 'AssignedToProvider':
      case 'InProgressByProvider':
        return 'default'; 
      case 'Pending Payment':
      case 'Rescheduled':
      case 'Processing':
        return 'secondary';
      case 'Cancelled':
      case 'ProviderRejected':
        return 'destructive';
      default: return 'outline';
    }
  };

const getStatusBadgeClass = (status: BookingStatus) => {
    switch (status) {
        case 'Completed': return 'bg-green-500 hover:bg-green-600';
        case 'Confirmed':
        case 'ProviderAccepted':
        case 'AssignedToProvider':
        case 'InProgressByProvider':
            return 'bg-blue-500 hover:bg-blue-600';
        case 'Pending Payment':
        case 'Rescheduled':
            return 'bg-orange-500 hover:bg-orange-600';
        case 'Processing':
            return 'bg-purple-500 hover:bg-purple-600';
        case 'Cancelled':
        case 'ProviderRejected':
            return 'bg-red-600 hover:bg-red-700';
        default: return '';
    }
};

const PAGE_SIZE = 10;

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<FirestoreBooking[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<BookingStatus | "All">("All");
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const router = useRouter();
  const [selectedBooking, setSelectedBooking] = useState<FirestoreBooking | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const [marketingConfig, setMarketingConfig] = useState<MarketingAutomationSettings | null>(null);

  const [selectedBookingForPaymentUpdate, setSelectedBookingForPaymentUpdate] = useState<FirestoreBooking | null>(null);
  const [isPaymentMethodDialogOpen, setIsPaymentMethodDialogOpen] = useState(false);
  const [paymentReceivedMethodForDialog, setPaymentReceivedMethodForDialog] = useState<string>("");

  const { settings: globalCompanySettings, isLoading: isLoadingCompanySettings } = useGlobalSettings();

  const [isRescheduleDialogOpen, setIsRescheduleDialogOpen] = useState(false);
  const [selectedBookingForReschedule, setSelectedBookingForReschedule] = useState<FirestoreBooking | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(undefined);
  const [rescheduleSelectedTimeSlot, setRescheduleSelectedTimeSlot] = useState<string | undefined>();
  const [rescheduleAvailableTimeSlots, setRescheduleAvailableTimeSlots] = useState<string[]>([]);
  const [isLoadingRescheduleSlots, setIsLoadingRescheduleSlots] = useState(false);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [bookingToAssign, setBookingToAssign] = useState<FirestoreBooking | null>(null);

  const handleWhatsAppClick = (booking: FirestoreBooking) => {
    if (booking.customerPhone) {
      const sanitizedPhone = booking.customerPhone.replace(/\D/g, '');
      const internationalPhone = sanitizedPhone.startsWith('91') ? sanitizedPhone : `91${sanitizedPhone}`;
      const message = encodeURIComponent(`Hi ${booking.customerName}, I'm contacting you from Wecanfix regarding your booking #${booking.bookingId}.`);
      window.open(`https://wa.me/${internationalPhone}?text=${message}`, '_blank');
    }
  };

  useEffect(() => {
    if (searchTerm.trim().length > 0) {
      const delayDebounceFn = setTimeout(async () => {
        setIsLoading(true);
        try {
          const bookingsRef = collection(db, "bookings");
          const term = searchTerm.trim();
          
          const idQuery = query(bookingsRef, where("bookingId", "==", term));
          const phoneQuery = query(bookingsRef, where("customerPhone", "==", term));
          const nameQuery = query(bookingsRef, where("customerName", ">=", term), where("customerName", "<=", term + '\uf8ff'));
          
          const [idSnap, phoneSnap, nameSnap] = await Promise.all([
            getDocs(idQuery),
            getDocs(phoneQuery),
            getDocs(nameQuery)
          ]);

          let results = [...idSnap.docs, ...phoneSnap.docs, ...nameSnap.docs].map(docSnap => ({
            ...docSnap.data(),
            id: docSnap.id
          } as FirestoreBooking));

          const uniqueResults = Array.from(new Map(results.map(b => [b.id, b])).values());
          setBookings(uniqueResults);
          setHasMore(false);
        } catch (error) {
          console.error("Booking search error:", error);
        } finally {
          setIsLoading(false);
        }
      }, 400);
      return () => clearTimeout(delayDebounceFn);
    } else {
      setIsLoading(true);
      const bookingsCollectionRef = collection(db, "bookings");
      const q = query(bookingsCollectionRef, orderBy("createdAt", "desc"), limit(PAGE_SIZE));

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const fetchedBookings = querySnapshot.docs.map(docSnap => ({
          ...docSnap.data(),
          id: docSnap.id,
        } as FirestoreBooking));
        setBookings(fetchedBookings);
        setLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(querySnapshot.docs.length === PAGE_SIZE);
        setIsLoading(false);
      }, (error) => {
        console.error("Error fetching bookings: ", error);
        setIsLoading(false);
      });

      return () => unsubscribe();
    }
  }, [searchTerm, toast]);

  const loadMoreBookings = async () => {
    if (isLoadingMore || !hasMore || searchTerm.trim().length > 0) return;
    setIsLoadingMore(true);
    try {
      const moreBookings = await getArchivedBookings();
      const existingIds = new Set(bookings.map(b => b.id));
      const newItems = moreBookings.filter(b => !existingIds.has(b.id));
      setBookings(prev => [...prev, ...newItems]);
      setHasMore(false);
    } catch (error) {
      console.error("Error loading more bookings:", error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const filteredBookings = useMemo(() => {
    return bookings.filter(booking => {
      const matchesStatus = filterStatus === "All" || booking.status === filterStatus;
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        booking.bookingId.toLowerCase().includes(searchLower) || 
        booking.customerName.toLowerCase().includes(searchLower) ||
        booking.customerPhone.includes(searchTerm);
      
      return matchesStatus && matchesSearch;
    });
  }, [bookings, filterStatus, searchTerm]);

  // Status and Action Handlers
  const handleStatusChange = async (booking: FirestoreBooking, newStatus: BookingStatus) => {
    if (!booking.id) return;
    setIsUpdatingStatus(booking.id);
    try {
      await updateDoc(doc(db, "bookings", booking.id), {
        status: newStatus,
        updatedAt: Timestamp.now(),
      });
      await triggerRefresh('bookings'); // SmartSync
      toast({ title: "Status Updated", description: `Booking is now ${newStatus}.` });
    } catch (error) {
      console.error("Error updating status:", error);
      toast({ title: "Update Failed", variant: "destructive" });
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const handleDeleteBooking = async (bookingId: string) => {
    if (!bookingId) return;
    setIsDeleting(bookingId);
    try {
      await deleteDoc(doc(db, "bookings", bookingId));
      await triggerRefresh('bookings'); // SmartSync
      toast({ title: "Booking Deleted", description: "The record has been removed." });
    } catch (error) {
      toast({ title: "Delete Failed", variant: "destructive" });
    } finally {
      setIsDeleting(null);
    }
  };

  const handleViewDetails = (booking: FirestoreBooking) => {
    setSelectedBooking(booking);
    setIsDetailsModalOpen(true);
  };

  const handleEditBooking = (bookingId: string) => {
    router.push(`/admin/bookings/edit/${bookingId}`);
  };

  const openAssignModal = (booking: FirestoreBooking) => {
    setBookingToAssign(booking);
    setIsAssignModalOpen(true);
  };

  const handleConfirmAssignment = async (bookingId: string, providerId: string, providerName: string) => {
    setIsUpdatingStatus(bookingId);
    try {
      await updateDoc(doc(db, "bookings", bookingId), {
        providerId,
        status: "AssignedToProvider",
        updatedAt: Timestamp.now(),
      });
      await triggerRefresh('bookings'); // SmartSync
      toast({ title: "Assigned", description: `Booking assigned to ${providerName}.` });
      setIsAssignModalOpen(false);
    } catch (error) {
      toast({ title: "Assignment Failed", variant: "destructive" });
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  // Rendering logic
  const renderBookingCard = (booking: FirestoreBooking) => (
    <Card key={booking.id} className="mb-4 shadow-md border-l-4 overflow-hidden hover:shadow-lg transition-shadow duration-300" style={{ borderLeftColor: getStatusBadgeClass(booking.status).split(' ')[0].replace('bg-', 'var(--') }}>
      <CardHeader className="p-4 pb-2 bg-muted/30">
        <div className="flex justify-between items-start">
            <div className="space-y-1">
                <CardTitle className="text-base font-mono font-bold text-primary tracking-tight">{booking.bookingId}</CardTitle>
                <div className="flex items-center text-sm font-bold text-foreground">
                  <UserCheck2 className="h-4 w-4 mr-1.5 text-primary" />
                  {booking.customerName}
                </div>
            </div>
            <Badge variant={getStatusBadgeVariant(booking.status)} className={`capitalize text-[11px] px-2.5 py-1 font-bold shadow-sm ${getStatusBadgeClass(booking.status)}`}>
                {isUpdatingStatus === booking.id ? <Loader2 className="h-3 w-3 animate-spin" /> : booking.status}
            </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-4 text-sm space-y-4">
        <div className="grid grid-cols-1 gap-2 bg-muted/20 p-3 rounded-lg border border-muted/50 shadow-inner">
           <div className="flex items-center justify-between text-foreground font-semibold text-sm">
             <div className="flex items-center">
               <Phone className="h-4 w-4 mr-2.5 text-primary" />
               {booking.customerPhone}
             </div>
             {booking.customerPhone && (
                <Button variant="ghost" size="icon" className="h-8 w-8 ml-2 hover:bg-primary/10 transition-colors" onClick={() => handleWhatsAppClick(booking)} title="Chat on WhatsApp">
                  <AppImage src="/whatsapp.png" alt="WhatsApp Icon" width={20} height={20} />
                </Button>
              )}
           </div>
           <div className="flex items-center text-foreground font-semibold text-sm break-all">
             <Mail className="h-4 w-4 mr-2.5 text-primary" />
             {booking.customerEmail}
           </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <span className="text-[11px] uppercase tracking-wider text-foreground font-extrabold flex items-center">
              <CalendarDays className="h-3.5 w-3.5 mr-1 text-primary" /> Date
            </span>
            <div className="text-sm font-bold text-foreground pl-1">
              {formatDateForDisplay(booking.scheduledDate)}
            </div>
          </div>
          <div className="space-y-1.5">
            <span className="text-[11px] uppercase tracking-wider text-foreground font-extrabold flex items-center">
              <Clock className="h-3.5 w-3.5 mr-1 text-primary" /> Slot
            </span>
            <div className="text-sm font-bold text-foreground pl-1">
              {booking.scheduledTimeSlot}
              {booking.estimatedEndTime && (
                <span className="ml-2 text-[10px] text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                  Ends: {new Date(booking.estimatedEndTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </span>
              )}
            </div>
          </div>
        </div>

        <Separator className="bg-muted" />

        <div className="space-y-2">
           <span className="text-[11px] uppercase tracking-wider text-foreground font-extrabold flex items-center">
             <ListOrdered className="h-4 w-4 mr-1.5 text-primary" /> Services
           </span>
           <div className="text-sm font-medium text-foreground bg-background p-3 rounded-lg border border-muted shadow-sm">
             {booking.services.map(s => `${s.name} (x${s.quantity})`).join(', ')}
           </div>
        </div>

        <div className="pt-2">
          <Select value={booking.status} onValueChange={(newStatus) => handleStatusChange(booking, newStatus as BookingStatus)} disabled={isUpdatingStatus === booking.id || isLoadingAppSettings}>
              <SelectTrigger className="h-10 text-sm font-bold bg-background shadow-md border-muted px-3">
                <div className="flex-1 flex justify-center">
                  <Badge variant={getStatusBadgeVariant(booking.status)} className={`capitalize px-4 py-1 font-bold shadow-md ${getStatusBadgeClass(booking.status)}`}>
                    {isUpdatingStatus === booking.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : booking.status}
                  </Badge>
                </div>
              </SelectTrigger>
              <SelectContent className="max-h-[350px]">
                {statusOptions.map(status => (<SelectItem key={status} value={status} className="text-sm font-medium">{status}</SelectItem>))}
              </SelectContent>
          </Select>
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0 flex flex-col gap-3 bg-muted/5">
        <div className="flex gap-2.5 w-full">
          <Button 
            variant="default" 
            size="sm" 
            className={cn(
              "flex-1 h-11 font-bold rounded-xl shadow-md transition-all duration-300",
              booking.providerId 
                ? "bg-muted/30 text-foreground border border-border/40 hover:bg-primary hover:text-primary-foreground" 
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
            onClick={() => openAssignModal(booking)} 
            disabled={isUpdatingStatus === booking.id || isLoadingAppSettings || ["Completed", "Cancelled"].includes(booking.status)}
          >
              {booking.providerId ? <Users className="mr-1.5 h-4 w-4 shrink-0" /> : <UserCheck2 className="mr-1.5 h-4 w-4 shrink-0" />}
              {booking.providerId ? "Reassign" : "Assign Provider"}
          </Button>
        </div>
        <div className="flex items-center gap-2.5 w-full">
          <Button variant="outline" size="sm" className="flex-1 text-sm h-10 bg-muted/30 text-foreground border border-border/40 font-bold shadow-sm hover:bg-primary hover:text-primary-foreground transition-all duration-300 rounded-xl" onClick={() => handleViewDetails(booking)}>
            <Eye className="h-4 w-4 mr-1.5"/> Details
          </Button>
          <Button variant="outline" size="sm" className="flex-1 text-sm h-10 bg-muted/30 text-foreground border border-border/40 font-bold shadow-sm hover:bg-primary hover:text-primary-foreground transition-all duration-300 rounded-xl" onClick={() => handleEditBooking(booking.id!)}>
            <Edit className="h-4 w-4 mr-1.5"/> Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-10 px-3 rounded-xl bg-destructive/5 text-destructive border border-destructive/10 hover:bg-destructive hover:text-white transition-all duration-300 shadow-sm" disabled={isDeleting === booking.id}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-[2.5rem]">
              <AlertDialogHeader>
                <div className="bg-destructive/10 w-12 h-12 rounded-2xl flex items-center justify-center mb-4"><Trash2 className="h-6 w-6 text-destructive" /></div>
                <AlertDialogTitle className="text-xl font-black tracking-tight uppercase">Delete Booking</AlertDialogTitle>
                <AlertDialogDescription className="font-medium text-sm">Remove booking <span className="text-destructive font-black underline">#{booking.bookingId}</span> from system?</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-6">
                <AlertDialogCancel className="rounded-xl border-none bg-muted">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDeleteBooking(booking.id!)} className="bg-destructive hover:bg-destructive/90 rounded-xl px-6">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardFooter>
    </Card>
  );

  return (
    <div className="space-y-6">
      <Card className="border-none shadow-md overflow-hidden">
        <CardHeader className="bg-primary/5 pb-8 sm:flex-row sm:items-center sm:justify-between border-b">
          <div className="space-y-1">
            <CardTitle className="text-2xl flex items-center font-bold">
              <Tag className="mr-2 h-6 w-6 text-primary" /> Manage Bookings
            </CardTitle>
            <CardDescription className="text-muted-foreground/80">
              Real-time dashboard for customer service requests and provider assignments.
            </CardDescription>
          </div>
          <div className="mt-4 sm:mt-0 flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="ID, Name, Phone..."
                className="pl-9 h-10 bg-background"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as BookingStatus | "All")}>
              <SelectTrigger className="h-10 sm:w-[180px] bg-background"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent><SelectItem value="All">All Statuses</SelectItem>{statusOptions.map(status => (<SelectItem key={status} value={status}>{status}</SelectItem>))}</SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center py-20">
               <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
               <p className="text-sm text-muted-foreground">Synchronizing database...</p>
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="text-center py-20 bg-muted/10">
              <PackageSearch className="h-10 w-10 text-muted-foreground/60 mx-auto" />
              <h3 className="text-lg font-semibold mt-4">No bookings found</h3>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10 shadow-sm">
                  <TableRow>
                    <TableHead className="w-[120px] font-bold text-foreground">Booking ID</TableHead>
                    <TableHead className="font-bold text-foreground">Customer</TableHead>
                    <TableHead className="font-bold text-foreground">Date & Time</TableHead>
                    <TableHead className="font-bold text-foreground">Services</TableHead>
                    <TableHead className="text-right font-bold text-foreground pr-6">Amount (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookings.map((booking) => (
                    <React.Fragment key={booking.id}>
                      <TableRow className="group hover:bg-primary/[0.03] transition-all duration-200 border-b-0">
                        <TableCell className="font-mono text-xs font-bold text-primary">{booking.bookingId}</TableCell>
                        <TableCell>
                          <div className="font-extrabold text-sm mb-1">{booking.customerName}</div>
                          <div className="text-xs font-bold">{booking.customerPhone}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-extrabold flex items-center text-foreground">
                            <CalendarDays className="h-3.5 w-3.5 mr-2 text-primary" />
                            {formatDateForDisplay(booking.scheduledDate)}
                          </div>
                          <div className="text-sm font-bold flex items-center mt-1">
                            <Clock className="h-3.5 w-3.5 mr-2 text-primary" />
                            {booking.scheduledTimeSlot}
                          </div>
                          {booking.estimatedEndTime && (
                            <div className="text-[10px] font-black flex items-center mt-1 text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full w-fit">
                              <History className="h-3 w-3 mr-1" />
                              Ends: {new Date(booking.estimatedEndTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                           <div className="text-xs font-bold bg-muted/40 px-3 py-2 rounded-lg leading-relaxed">
                             {booking.services.map(s => s.name).join(', ')}
                           </div>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="font-black text-lg text-foreground flex items-center justify-end tracking-tight">
                             <IndianRupee className="h-4 w-4 mr-0.5 text-green-600" />
                             {booking.totalAmount.toLocaleString()}
                          </div>
                        </TableCell>
                      </TableRow>
                      <TableRow className="bg-muted/5 group-hover:bg-primary/[0.01] border-b-2 transition-colors">
                        <TableCell colSpan={5} className="py-4 px-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <Select value={booking.status} onValueChange={(newStatus) => handleStatusChange(booking, newStatus as BookingStatus)} disabled={isUpdatingStatus === booking.id}>
                                <SelectTrigger className="h-10 text-xs bg-background shadow-md border-muted px-2 rounded-xl w-[180px]">
                                    <Badge variant={getStatusBadgeVariant(booking.status)} className={`capitalize px-3 py-0.5 font-bold shadow-sm ${getStatusBadgeClass(booking.status)}`}>
                                      {isUpdatingStatus === booking.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : booking.status}
                                    </Badge>
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                  {statusOptions.map(status => (<SelectItem key={status} value={status}>{status}</SelectItem>))}
                                </SelectContent>
                            </Select>

                            <Button 
                              variant="default" 
                              size="sm" 
                              className={cn(
                                "h-10 px-4 font-bold rounded-xl shadow-sm transition-all duration-300",
                                booking.providerId 
                                  ? "bg-muted/30 text-foreground border border-border/40 hover:bg-primary hover:text-primary-foreground" 
                                  : "bg-primary text-primary-foreground hover:bg-primary/90"
                              )}
                              onClick={() => openAssignModal(booking)} 
                              disabled={isUpdatingStatus === booking.id || isLoadingAppSettings || ["Completed", "Cancelled"].includes(booking.status)}
                            >
                                {booking.providerId ? <Users className="mr-1.5 h-4 w-4" /> : <UserCheck2 className="mr-1.5 h-4 w-4" />}
                                {booking.providerId ? "Reassign" : "Assign Provider"}
                            </Button>

                            <Button variant="outline" size="sm" className="h-10 px-4 font-bold rounded-xl" onClick={() => handleViewDetails(booking)}>Details</Button>
                            <Button variant="outline" size="sm" className="h-10 px-4 font-bold rounded-xl" onClick={() => handleEditBooking(booking.id!)}>Edit</Button>
                            
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-10 px-3 rounded-xl bg-destructive/5 text-destructive border border-destructive/10 hover:bg-destructive hover:text-white transition-all duration-300" disabled={isDeleting === booking.id}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-[2.5rem]">
                                <AlertDialogHeader>
                                  <div className="bg-destructive/10 w-12 h-12 rounded-2xl flex items-center justify-center mb-4"><Trash2 className="h-6 w-6 text-destructive" /></div>
                                  <AlertDialogTitle className="text-xl font-black tracking-tight uppercase">Delete Booking</AlertDialogTitle>
                                  <AlertDialogDescription className="font-medium text-sm">Are you absolutely sure you want to delete booking <span className="text-destructive font-black underline">#{booking.bookingId}</span>? This action cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter className="mt-6">
                                  <AlertDialogCancel className="rounded-xl border-none bg-muted">Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteBooking(booking.id!)} className="bg-destructive hover:bg-destructive/90 rounded-xl px-6">Confirm Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  ))}
                </TableBody>
                </Table>
              </div>
              <div className="md:hidden p-4 space-y-4">
                {filteredBookings.map(renderBookingCard)}
              </div>
              
              {hasMore && !searchTerm && (
                <div className="p-6 text-center border-t">
                  <Button 
                    variant="outline" 
                    size="lg" 
                    onClick={loadMoreBookings} 
                    disabled={isLoadingMore} 
                    className="min-w-[200px] rounded-full border-2 border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all duration-300 shadow-sm"
                  >
                    {isLoadingMore ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <ChevronDown className="h-5 w-5 mr-2" />}
                    Load More Bookings
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {selectedBooking && (<Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}><DialogContent className="max-w-3xl w-[90vw] max-h-[90vh] flex flex-col p-0"><DialogHeader className="p-6 pb-4 border-b"><DialogTitle>Booking Details: {selectedBooking.bookingId}</DialogTitle></DialogHeader><div className="overflow-y-auto flex-grow p-6"><BookingDetailsModalContent booking={selectedBooking} /></div><div className="p-6 border-t flex justify-end"><DialogClose asChild><Button variant="outline">Close</Button></DialogClose></div></DialogContent></Dialog>)}
      
      {bookingToAssign && (
        <AssignProviderModal
            isOpen={isAssignModalOpen}
            onClose={() => { setIsAssignModalOpen(false); setBookingToAssign(null); }}
            booking={bookingToAssign}
            onAssignConfirm={handleConfirmAssignment}
        />
      )}
    </div>
  );
}
