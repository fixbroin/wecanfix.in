
"use client";

import { useEffect, useState } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import type { FirestoreUser, Address } from '@/types/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { UserCircle, Mail, Phone, CalendarDays, CheckCircle, XCircle, Loader2, Edit3, Save, MapPin } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import Image from 'next/image';

interface UserDetailsModalProps {
  user: FirestoreUser;
  onClose: () => void;
  onUpdateUser: (updatedData: Partial<FirestoreUser>) => Promise<boolean>;
}

const userEditSchema = z.object({
  displayName: z.string().min(2, "Name must be at least 2 characters.").max(50, "Name too long."),
  email: z.string().email("Invalid email address."),
  mobileNumber: z.string()
    .min(10, "Mobile number must be 10-15 digits.")
    .max(15, "Mobile number cannot exceed 15 digits.")
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone format (e.g., +919876543210 or 9876543210).")
    .optional().or(z.literal('')),
});

type UserEditFormData = z.infer<typeof userEditSchema>;

export default function UserDetailsModal({ user, onClose, onUpdateUser }: UserDetailsModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<UserEditFormData>({
    resolver: zodResolver(userEditSchema),
    defaultValues: {
      displayName: user.displayName || "",
      email: user.email || "",
      mobileNumber: user.mobileNumber || "",
    },
  });

  useEffect(() => {
    form.reset({
      displayName: user.displayName || "",
      email: user.email || "",
      mobileNumber: user.mobileNumber || "",
    });
  }, [user, form]);

  const onSubmit = async (data: UserEditFormData) => {
    setIsSubmitting(true);
    const success = await onUpdateUser({
      displayName: data.displayName,
      email: data.email,
      mobileNumber: data.mobileNumber || null,
    });
    setIsSubmitting(false);
    if (success) {
      setIsEditing(false);
    }
  };

  const formatTimestampForIndia = (timestamp?: any): string => {
    if (!timestamp) return 'N/A';
    let date: Date;
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else {
      try {
        date = new Date(timestamp);
        if (isNaN(date.getTime())) throw new Error("Invalid date from timestamp string");
      } catch (e) {
        return String(timestamp);
      }
    }
    return date.toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  };
  
  const handleWhatsAppClick = () => {
    if (user.mobileNumber) {
      const sanitizedPhone = user.mobileNumber.replace(/[^\d+]/g, '');
      const internationalPhone = sanitizedPhone.startsWith('+') ? sanitizedPhone.substring(1) : `91${sanitizedPhone}`;
      const whatsappUrl = `https://wa.me/${internationalPhone}?text=Hi`;
      window.open(whatsappUrl, '_blank');
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col max-h-[80vh] relative">
        <DialogHeader className="p-6 pb-4 border-b flex-shrink-0">
          <div className="flex items-center space-x-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.photoURL || undefined} alt={user.displayName || "User"} />
              <AvatarFallback className="text-2xl">
                {user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email ? user.email.charAt(0).toUpperCase() : <UserCircle />}
              </AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle className="text-2xl">{isEditing ? "Edit User Details" : "User Details"}</DialogTitle>
              <DialogDescription>
                {isEditing ? `Modify information for ${user.displayName || user.email}.` : `Viewing details for ${user.displayName || user.email}.`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-grow overflow-y-auto pb-20">
          <div className="p-6 space-y-6">
            {isEditing ? (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center"><UserCircle className="mr-2 h-4 w-4 text-muted-foreground"/>Display Name</FormLabel>
                      <FormControl><Input {...field} disabled={isSubmitting} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center"><Mail className="mr-2 h-4 w-4 text-muted-foreground"/>Email Address</FormLabel>
                      <FormControl><Input type="email" {...field} disabled={isSubmitting} /></FormControl>
                      <FormMessage />
                      <FormDescription className="text-xs">Changing this only updates Firestore record, not Firebase Auth login email without Admin SDK.</FormDescription>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mobileNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center"><Phone className="mr-2 h-4 w-4 text-muted-foreground"/>Mobile Number</FormLabel>
                      <FormControl><Input type="tel" {...field} disabled={isSubmitting} placeholder="e.g., +919876543210" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><strong>Display Name:</strong> {user.displayName || "N/A"}</div>
                  <div><strong>Email:</strong> {user.email || "N/A"}</div>
                  <div className="flex items-center gap-2">
                    <strong>Mobile:</strong> {user.mobileNumber || "N/A"}
                    {user.mobileNumber && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleWhatsAppClick} title="Chat on WhatsApp">
                           <Image src="/whatsapp.png" alt="WhatsApp Icon" width={24} height={24} />
                           <span className="sr-only">Chat on WhatsApp</span>
                        </Button>
                    )}
                  </div>
                  <div><strong>User ID (UID):</strong> <span className="text-xs">{user.uid}</span></div>
                  <div><strong>Created At:</strong> {formatTimestampForIndia(user.createdAt)}</div>
                  <div><strong>Last Login:</strong> {formatTimestampForIndia(user.lastLoginAt)}</div>
                  <div>
                    <strong>Status:</strong>
                    <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${user.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                      {user.isActive ? <CheckCircle className="mr-1 h-3 w-3"/> : <XCircle className="mr-1 h-3 w-3"/>}
                      {user.isActive ? "Active" : "Disabled"}
                    </span>
                  </div>
                  {user.roles && user.roles.length > 0 && <div><strong>Roles:</strong> {user.roles.join(', ')}</div>}
                </div>
              </div>
            )}
            <Separator className="my-4"/>
            <div>
              <h3 className="text-lg font-semibold mb-3">Saved Addresses ({user.addresses?.length || 0})</h3>
              {user.addresses && user.addresses.length > 0 ? (
                <div className="space-y-3">
                  {user.addresses.map((address) => (
                    <div key={address.id} className="p-3 border rounded-md text-xs bg-muted/30">
                      <p className="font-semibold">{address.fullName}</p>
                      <p>{address.addressLine1}{address.addressLine2 ? `, ${address.addressLine2}` : ''}</p>
                      <p>{address.city}, {address.state} - {address.pincode}</p>
                      <p>Ph: {address.phone}</p>
                      {address.latitude && address.longitude && (
                        <a href={`https://www.google.com/maps?q=${address.latitude},${address.longitude}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 mt-1">
                          <MapPin size={12}/> View on Map
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No saved addresses for this user.</p>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="p-6 border-t bg-muted/50 flex-shrink-0 fixed bottom-0 left-0 right-0 z-10">
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={() => { onClose(); setIsEditing(false); }} disabled={isSubmitting}>Close</Button>
          </DialogClose>
          {isEditing ? (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => {
                setTimeout(() => {
                  setIsEditing(true);
                }, 0);
              }}
            >
              <Edit3 className="mr-2 h-4 w-4" /> Edit User
            </Button>
          )}
        </DialogFooter>
      </form>
    </Form>
  );
}
