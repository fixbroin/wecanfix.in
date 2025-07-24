
"use client";

import { useState, useEffect } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Loader2, Send, AlertTriangle, PackageSearch, History } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, runTransaction, getDoc, addDoc, doc, Timestamp, getDocs, limit } from "firebase/firestore";
import type { WithdrawalSettings, WithdrawalRequest, WithdrawalMethodType, WithdrawalStatus, FirestoreNotification, FirestoreUser } from '@/types/firestore';
import { useAuth } from '@/hooks/useAuth';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';

const withdrawalFormSchema = z.object({
  amount: z.coerce.number().positive("Withdrawal amount must be positive.").nullable(),
  method: z.string({ required_error: "Please select a withdrawal method." }),
  details: z.object({
    email: z.string().email("Invalid email.").optional(),
    mobileNumber: z.string().optional(),
    accountHolderName: z.string().optional(),
    bankName: z.string().optional(),
    accountNumber: z.string().optional(),
    ifscCode: z.string().optional(),
    upiId: z.string().optional(),
  }),
});
type WithdrawalFormData = z.infer<typeof withdrawalFormSchema>;

const formatDate = (timestamp?: Timestamp) => {
    if (!timestamp) return 'N/A';
    return timestamp.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function WithdrawalTab({ settings }: WithdrawalTabProps) {
  const { user, firestoreUser, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [withdrawalHistory, setWithdrawalHistory] = useState<WithdrawalRequest[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const form = useForm<WithdrawalFormData>({
    resolver: zodResolver(withdrawalFormSchema),
    defaultValues: {
      amount: 0,
      method: undefined,
      details: {
        email: "",
        mobileNumber: "",
        accountHolderName: firestoreUser?.displayName || "",
        bankName: "",
        accountNumber: "",
        ifscCode: "",
        upiId: "",
      },
    },
  });

  useEffect(() => {
    if (firestoreUser) {
        form.reset({
            amount: 0,
            method: undefined,
            details: {
                email: firestoreUser.email || "",
                mobileNumber: firestoreUser.mobileNumber || "",
                accountHolderName: firestoreUser.displayName || "",
                bankName: "",
                accountNumber: "",
                ifscCode: "",
                upiId: "",
            },
        });
    }
  }, [firestoreUser, form]);
  
  useEffect(() => {
    if (!user?.uid) {
        setIsLoadingHistory(false);
        return;
    }
    setIsLoadingHistory(true);
    const q = query(collection(db, "withdrawalRequests"), where("userId", "==", user.uid), orderBy("requestedAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        setWithdrawalHistory(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as WithdrawalRequest)));
        setIsLoadingHistory(false);
    });
    return () => unsubscribe();
  }, [user?.uid]);

  const watchedMethod = form.watch("method");

  const onSubmit = async (data: WithdrawalFormData) => {
    if (!user || !firestoreUser) {
        toast({ title: "Authentication Error", description: "Please log in to submit a request.", variant: "destructive" });
        return;
    }
    if (!data.amount || data.amount <= 0) {
        form.setError("amount", { message: "Please enter a valid amount to withdraw." });
        return;
    }
    if (firestoreUser.withdrawalPending) {
        toast({ title: "Request Pending", description: "You already have a withdrawal request being processed.", variant: "destructive"});
        return;
    }
    setIsSubmitting(true);
    
    // Validations
    if (!settings || !settings.isWithdrawalEnabled) {
      toast({ title: "Withdrawals Disabled", variant: "destructive" });
      setIsSubmitting(false); return;
    }
    if (data.amount < settings.minWithdrawalAmount) {
      form.setError("amount", { message: `Minimum withdrawal is ₹${settings.minWithdrawalAmount}` });
      setIsSubmitting(false); return;
    }
    if (data.amount > (firestoreUser.walletBalance || 0)) {
      form.setError("amount", { message: "Withdrawal amount exceeds your available balance." });
      setIsSubmitting(false); return;
    }

    try {
        const newRequestData: Omit<WithdrawalRequest, 'id'> = {
            userId: user.uid,
            userName: firestoreUser.displayName || "N/A",
            userEmail: firestoreUser.email || "N/A",
            amount: data.amount,
            method: data.method as WithdrawalMethodType,
            details: data.details,
            status: 'pending',
            requestedAt: Timestamp.now(),
        };
        
        // Use a transaction to update user wallet and create request
        await runTransaction(db, async (transaction) => {
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await transaction.get(userDocRef);
            if (!userDoc.exists() || (userDoc.data().walletBalance || 0) < data.amount!) {
                throw new Error("Insufficient wallet balance.");
            }
            
            // Create the request document first (so we can reference it if needed)
            const newRequestRef = doc(collection(db, "withdrawalRequests"));
            transaction.set(newRequestRef, newRequestData);
            
            // Update user's balance and pending status
            transaction.update(userDocRef, {
                walletBalance: (userDoc.data().walletBalance || 0) - data.amount!,
                withdrawalPending: true,
            });
        });

        toast({ title: "Request Submitted", description: "Your withdrawal request has been received and is being processed."});
        
        // Send notification to admin after successful transaction
        const adminQuery = query(collection(db, "users"), where("email", "==", ADMIN_EMAIL), limit(1));
        const adminSnapshot = await getDocs(adminQuery);
        if (!adminSnapshot.empty) {
            const adminUserDoc = adminSnapshot.docs[0];
            const adminUid = adminUserDoc.id;
            const adminNotification: FirestoreNotification = {
                userId: adminUid,
                title: "New Withdrawal Request",
                message: `${firestoreUser.displayName || 'A user'} has requested a withdrawal of ₹${data.amount.toFixed(2)}.`,
                type: 'admin_alert',
                href: `/admin/referral-settings?tab=withdrawal_requests`,
                read: false,
                createdAt: Timestamp.now(),
            };
            await addDoc(collection(db, "userNotifications"), adminNotification);
        } else {
            console.warn("Admin user not found. Could not send withdrawal request notification.");
        }

        form.reset();
    } catch (error) {
        toast({ title: "Error", description: (error as Error).message || "Could not submit your request.", variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

  const renderMethodFields = () => {
    switch (watchedMethod) {
      case 'amazon_gift_card': return (
        <>
          <FormField control={form.control} name="details.email" render={({ field }) => (<FormItem><FormLabel>Email for Gift Card</FormLabel><FormControl><Input type="email" placeholder="your@email.com" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
          <FormField control={form.control} name="details.mobileNumber" render={({ field }) => (<FormItem><FormLabel>Mobile for Gift Card</FormLabel><FormControl><Input type="tel" placeholder="+91..." {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
        </>
      );
      case 'bank_transfer': return (
        <>
          <FormField control={form.control} name="details.accountHolderName" render={({ field }) => (<FormItem><FormLabel>Account Holder Name</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
          <FormField control={form.control} name="details.bankName" render={({ field }) => (<FormItem><FormLabel>Bank Name</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
          <FormField control={form.control} name="details.accountNumber" render={({ field }) => (<FormItem><FormLabel>Account Number</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
          <FormField control={form.control} name="details.ifscCode" render={({ field }) => (<FormItem><FormLabel>IFSC Code</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
        </>
      );
      case 'upi': return (
        <FormField control={form.control} name="details.upiId" render={({ field }) => (<FormItem><FormLabel>UPI ID</FormLabel><FormControl><Input placeholder="yourname@okhdfc" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
      );
      default: return null;
    }
  };
  
  if (authIsLoading || !settings) {
    return <Card><CardContent className="pt-6"><div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin"/></div></CardContent></Card>
  }

  if (!settings.isWithdrawalEnabled) {
      return (
        <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
                <AlertTriangle className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
                <p>Withdrawals are currently disabled.</p>
            </CardContent>
        </Card>
      );
  }
  
  const getStatusBadgeVariant = (status: WithdrawalStatus) => {
    switch(status) {
      case 'pending': return 'secondary';
      case 'approved': return 'default';
      case 'processing': return 'default';
      case 'completed': return 'default';
      case 'rejected': return 'destructive';
      default: return 'outline';
    }
  };
  
  const getStatusBadgeClass = (status: WithdrawalStatus) => {
     switch(status) {
      case 'approved':
      case 'completed':
        return 'bg-green-500 hover:bg-green-600';
      case 'processing':
         return 'bg-blue-500 hover:bg-blue-600';
      default: return '';
    }
  }


  return (
    <div className="space-y-6">
        <Card>
        <CardHeader>
            <CardTitle>Request a Withdrawal</CardTitle>
            <CardDescription>Transfer your wallet balance. Minimum withdrawal is ₹{settings.minWithdrawalAmount || 0}.</CardDescription>
        </CardHeader>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
                {firestoreUser?.withdrawalPending && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Request Already Pending</AlertTitle>
                        <AlertDescription>You have a withdrawal request that is currently being processed. Please wait for it to be completed before making a new one.</AlertDescription>
                    </Alert>
                )}
                <FormField control={form.control} name="amount" render={({ field }) => (<FormItem><FormLabel>Amount to Withdraw (₹)</FormLabel><FormControl><Input type="number" placeholder={`Available: ₹${(firestoreUser?.walletBalance || 0).toFixed(2)}`} {...field} value={field.value ?? ""} disabled={isSubmitting || firestoreUser?.withdrawalPending} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="method" render={({ field }) => (
                    <FormItem><FormLabel>Withdrawal Method</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting || firestoreUser?.withdrawalPending}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select a method" /></SelectTrigger></FormControl>
                        <SelectContent>
                            {settings?.enabledMethods?.bank_transfer && <SelectItem value="bank_transfer">Bank Transfer</SelectItem>}
                            {settings?.enabledMethods?.upi && <SelectItem value="upi">UPI</SelectItem>}
                            {settings?.enabledMethods?.amazon_gift_card && <SelectItem value="amazon_gift_card">Amazon Gift Card</SelectItem>}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}/>
                {watchedMethod && <div className="space-y-4 p-4 border rounded-md">{renderMethodFields()}</div>}
            </CardContent>
            <CardFooter>
                <Button type="submit" disabled={isSubmitting || firestoreUser?.withdrawalPending}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Submit Request
                </Button>
            </CardFooter>
            </form>
        </Form>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle className="flex items-center"><History className="mr-2 h-5 w-5"/>Withdrawal History</CardTitle>
                <CardDescription>A log of your withdrawal requests.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoadingHistory ? (
                     <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></div>
                ) : withdrawalHistory.length === 0 ? (
                    <div className="text-center py-10">
                        <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                        <p className="text-muted-foreground">You have not made any withdrawal requests yet.</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Amount (₹)</TableHead>
                                <TableHead>Method</TableHead>
                                <TableHead>Date Requested</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {withdrawalHistory.map(req => (
                                <TableRow key={req.id}>
                                    <TableCell className="font-semibold">₹{req.amount.toFixed(2)}</TableCell>
                                    <TableCell className="capitalize">{req.method.replace('_', ' ')}</TableCell>
                                    <TableCell className="text-xs">{formatDate(req.requestedAt)}</TableCell>
                                    <TableCell>
                                        <Badge variant={getStatusBadgeVariant(req.status)} className={`capitalize ${getStatusBadgeClass(req.status)}`}>
                                            {req.status}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    </div>
  );
}
