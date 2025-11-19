
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Users, Eye, Trash2, Loader2, UserCircle, PackageSearch, ShieldCheck, ShieldAlert, XCircle, Search, Download, FileDown } from "lucide-react";
import type { FirestoreUser, Address } from '@/types/firestore';
import { db, auth } from '@/lib/firebase'; 
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { updateProfile } from "firebase/auth"; 
import { useToast } from "@/hooks/use-toast";
import UserDetailsModal from '@/components/admin/UserDetailsModal'; 
import { Input } from '@/components/ui/input';
import Image from 'next/image';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

const formatUserTimestamp = (timestamp?: Timestamp): string => {
  if (!timestamp) return 'N/A';
  return timestamp.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

type SelectableUserField = keyof Omit<FirestoreUser, 'addresses' | 'fcmTokens' | 'marketingStatus' | 'roles' | 'photoURL'> | 'fullAddress';

const availableFields: { key: SelectableUserField; label: string }[] = [
  { key: 'displayName', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'mobileNumber', label: 'Mobile Number' },
  { key: 'fullAddress', label: 'Primary Address' },
  { key: 'walletBalance', label: 'Wallet Balance' },
  { key: 'isActive', label: 'Status' },
  { key: 'createdAt', label: 'Creation Date' },
  { key: 'lastLoginAt', label: 'Last Login' },
];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");

  const [selectedUserForModal, setSelectedUserForModal] = useState<FirestoreUser | null>(null);
  const [isUserDetailsModalOpen, setIsUserDetailsModalOpen] = useState(false);

  const [selectedFields, setSelectedFields] = useState<Record<SelectableUserField, boolean>>({
    displayName: true, email: true, mobileNumber: true, fullAddress: false, 
    walletBalance: false, isActive: true, createdAt: false, lastLoginAt: false,
    id: false, uid: false, // Ensure non-selectable fields are here
  });


  useEffect(() => {
    setIsLoading(true);
    const usersCollectionRef = collection(db, "users");
    const q = query(usersCollectionRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedUsers = querySnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id, 
      } as FirestoreUser));
      setUsers(fetchedUsers);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching users: ", error);
      toast({ title: "Error", description: "Could not fetch users.", variant: "destructive" });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);

  const filteredUsers = useMemo(() => {
    if (!searchTerm) {
      return users;
    }
    const lowercasedTerm = searchTerm.toLowerCase();
    return users.filter(user =>
      user.displayName?.toLowerCase().includes(lowercasedTerm) ||
      user.email?.toLowerCase().includes(lowercasedTerm) ||
      user.mobileNumber?.includes(searchTerm) // Keep phone search exact or startsWith
    );
  }, [users, searchTerm]);

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    if (!userId) {
        toast({title: "Error", description: "User ID is missing.", variant: "destructive"});
        return;
    }
    setIsUpdatingStatus(userId);
    const userDocRef = doc(db, "users", userId);
    try {
      await updateDoc(userDocRef, { 
        isActive: !currentStatus,
      });
      toast({ title: "Success", description: `User status updated to ${!currentStatus ? 'Active' : 'Disabled'}.` });
      
      if (!currentStatus === false) { 
        console.warn(`User ${userId} marked as inactive in Firestore. Consider disabling in Firebase Auth via Admin SDK for full effect.`);
      }
    } catch (error) {
      console.error("Error updating user status: ", error);
      toast({ title: "Error", description: "Could not update user status.", variant: "destructive" });
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!userId) {
      toast({ title: "Error", description: "User ID is missing for delete.", variant: "destructive" });
      return;
    }
    setIsDeleting(userId);
    try {
      const userDocRef = doc(db, "users", userId);
      await deleteDoc(userDocRef);
      toast({ title: "User Deleted (Firestore)", description: `User ${userId} document deleted from Firestore. Auth record still exists.` });
      console.warn(`User ${userId} document deleted from Firestore. Implement Firebase Auth user deletion via Admin SDK.`);
    } catch (error) {
      console.error("Error deleting user document: ", error);
      toast({ title: "Error", description: "Could not delete user document from Firestore.", variant: "destructive" });
    } finally {
      setIsDeleting(null);
    }
  };
  
  const handleViewDetails = (user: FirestoreUser) => {
    setSelectedUserForModal(user);
    setIsUserDetailsModalOpen(true);
  };

  const handleUpdateUserFromModal = async (updatedUserData: Partial<FirestoreUser>) => {
    if (!selectedUserForModal || !selectedUserForModal.id) {
        toast({ title: "Error", description: "No user selected for update.", variant: "destructive" });
        return false;
    }

    const userDocRef = doc(db, "users", selectedUserForModal.id);
    let firebaseAuthProfileUpdatePromise: Promise<void> | null = null;

    try {
        const firestoreUpdateData: Partial<FirestoreUser> = {
            ...(updatedUserData.displayName !== undefined && { displayName: updatedUserData.displayName }),
            ...(updatedUserData.email !== undefined && { email: updatedUserData.email }), 
            ...(updatedUserData.mobileNumber !== undefined && { mobileNumber: updatedUserData.mobileNumber }),
        };

        await updateDoc(userDocRef, firestoreUpdateData);

        if (updatedUserData.displayName && auth.currentUser && auth.currentUser.uid === selectedUserForModal.uid) {
            firebaseAuthProfileUpdatePromise = updateProfile(auth.currentUser, { displayName: updatedUserData.displayName });
        } else if (updatedUserData.displayName && selectedUserForModal.uid) {
            console.warn(`Admin updated displayName for ${selectedUserForModal.uid} in Firestore. Auth profile displayName may need Admin SDK to sync if this user is not the current admin.`);
        }
        
        if (firebaseAuthProfileUpdatePromise) {
            await firebaseAuthProfileUpdatePromise;
        }
        
        toast({ title: "Success", description: "User details updated successfully." });
        setIsUserDetailsModalOpen(false);
        return true;
    } catch (error) {
        console.error("Error updating user:", error);
        toast({ title: "Error", description: (error as Error).message || "Could not update user details.", variant: "destructive" });
        return false;
    }
  };

  const handleWhatsAppClick = (e: React.MouseEvent, mobileNumber: string) => {
    e.stopPropagation();
    const sanitizedPhone = mobileNumber.replace(/[^\d+]/g, '');
    const internationalPhone = sanitizedPhone.startsWith('+') ? sanitizedPhone.substring(1) : `91${sanitizedPhone}`;
    const intentUrl = `intent://send/?phone=${internationalPhone}&text=Hi#Intent;scheme=whatsapp;end`;
    window.location.href = intentUrl;
  };

  const formatAddress = (address?: Address): string => {
    if (!address) return 'N/A';
    return `${address.addressLine1}, ${address.city}, ${address.state} - ${address.pincode}`;
  };

  const processDataForDownload = () => {
    const headers = availableFields.filter(f => selectedFields[f.key]).map(f => f.label);
    const keys = availableFields.filter(f => selectedFields[f.key]).map(f => f.key);

    return {
      headers,
      data: filteredUsers.map(user => {
        return keys.map(key => {
          if (key === 'fullAddress') {
            const primaryAddress = user.addresses?.find(a => a.isDefault) || user.addresses?.[0];
            return primaryAddress ? formatAddress(primaryAddress) : "N/A";
          }
          if (key === 'createdAt' || key === 'lastLoginAt') {
            const timestamp = user[key];
            return timestamp ? formatUserTimestamp(timestamp as Timestamp) : "N/A";
          }
          if (key === 'isActive') {
            return user.isActive ? "Active" : "Disabled";
          }
          return user[key as keyof FirestoreUser] ?? 'N/A';
        });
      })
    };
  };

  const handleDownload = (format: 'csv' | 'excel' | 'pdf') => {
    const { headers, data } = processDataForDownload();
    if (data.length === 0) {
      toast({ title: "No Data", description: "No users to download.", variant: "default" });
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `users_export_${timestamp}`;

    if (format === 'csv') {
      const csvContent = [headers.join(','), ...data.map(row => row.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.csv`;
      link.click();
    } else if (format === 'excel') {
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Users");
      XLSX.writeFile(workbook, `${filename}.xlsx`);
    } else if (format === 'pdf') {
      const doc = new jsPDF();
      doc.text("User List", 14, 16);
      (doc as any).autoTable({
        head: [headers],
        body: data,
        startY: 20,
      });
      doc.save(`${filename}.pdf`);
    }
  };

  // Function to render a single user card for mobile view
  const renderUserCard = (user: FirestoreUser) => (
    <Card key={user.id} className="mb-4">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user.photoURL || undefined} alt={user.displayName || user.email || "U"} />
            <AvatarFallback className="text-sm">
              {user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email ? user.email.charAt(0).toUpperCase() : <UserCircle size={18}/>}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-foreground break-words">{user.displayName || 'N/A'}</p>
            <p className="text-xs text-muted-foreground break-all" title={user.uid}>ID: {user.uid}</p>
          </div>
        </div>
        <div className="text-sm space-y-1 pl-1">
           <p className="text-xs text-muted-foreground break-all"><strong>Email:</strong> {user.email || 'N/A'}</p>
           <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground"><strong>Mobile:</strong> {user.mobileNumber || 'N/A'}</p>
                {user.mobileNumber && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => handleWhatsAppClick(e, user.mobileNumber!)} title="Chat on WhatsApp">
                    <Image src="/whatsapp.png" alt="WhatsApp Icon" width={16} height={16} />
                    <span className="sr-only">Chat on WhatsApp</span>
                    </Button>
                )}
            </div>
           <p className="text-xs text-muted-foreground"><strong>Joined:</strong> {formatUserTimestamp(user.createdAt)}</p>
           <div className="flex items-center justify-between pt-2">
            <div>
              <strong>Status:</strong>
              <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleToggleUserStatus(user.id, user.isActive)}
                  disabled={isUpdatingStatus === user.id}
                  title={user.isActive ? "Deactivate User" : "Activate User"}
                  className="px-2 h-auto"
              >
                {isUpdatingStatus === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 
                  user.isActive ? <ShieldCheck className="h-5 w-5 text-green-500" /> : <ShieldAlert className="h-5 w-5 text-red-500" />
                }
                <span className="ml-2 text-xs">{user.isActive ? "Active" : "Disabled"}</span>
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleViewDetails(user)} title="View/Edit Details">
                <Eye className="h-4 w-4" /><span className="sr-only">View/Edit Details</span>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="icon" className="h-8 w-8" title="Delete User" disabled={isDeleting === user.id || !user.id}>
                    {isDeleting === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}<span className="sr-only">Delete User</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This will delete Firestore data for {user.displayName || user.email}.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDeleteUser(user.id!)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
           </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Users className="mr-2 h-6 w-6 text-primary" /> Manage Users
          </CardTitle>
          <CardDescription>
            View and manage registered users. Toggle active status or delete user records.
          </CardDescription>
          <div className="pt-4 flex items-center justify-start gap-2">
            <div className="relative flex-grow max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground"/>
              <Input
                  placeholder="Search by name, email, mobile..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-10"
              />
              {searchTerm && (
                  <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearchTerm('')}>
                      <XCircle className="h-5 w-5 text-muted-foreground"/>
                  </Button>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10">
                    <Download className="mr-2 h-4 w-4" /> Download
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Select Fields to Download</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availableFields.map(field => (
                  <DropdownMenuCheckboxItem
                    key={field.key}
                    checked={selectedFields[field.key]}
                    onCheckedChange={(checked) => setSelectedFields(prev => ({...prev, [field.key]: checked}))}
                    onSelect={(e) => e.preventDefault()} // Prevents menu from closing on check
                  >
                    {field.label}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FileDown className="mr-2 h-4 w-4"/>
                    Export as...
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => handleDownload('pdf')}>PDF</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDownload('excel')}>Excel (XLSX)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDownload('csv')}>CSV</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-10">
              <PackageSearch className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">{searchTerm ? `No users found matching "${searchTerm}".` : "No users found yet."}</p>
            </div>
          ) : (
            <>
              {/* Desktop and Tablet View */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Avatar</TableHead>
                      <TableHead>User ID (UID)</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Mobile</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right min-w-[150px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.photoURL || undefined} alt={user.displayName || user.email || "U"} />
                            <AvatarFallback className="text-xs">
                              {user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email ? user.email.charAt(0).toUpperCase() : <UserCircle size={16}/>}
                            </AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell className="font-medium text-xs break-all">{user.uid}</TableCell>
                        <TableCell>{user.displayName || "N/A"}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{user.mobileNumber || "N/A"}</span>
                            {user.mobileNumber && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => handleWhatsAppClick(e, user.mobileNumber!)}
                                title="Chat on WhatsApp"
                              >
                                <Image src="/whatsapp.png" alt="WhatsApp Icon" width={18} height={18} />
                                <span className="sr-only">Chat on WhatsApp</span>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{formatUserTimestamp(user.createdAt)}</TableCell>
                        <TableCell className="text-center">
                          <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleToggleUserStatus(user.id, user.isActive)}
                              disabled={isUpdatingStatus === user.id}
                              title={user.isActive ? "Deactivate User" : "Activate User"}
                              className="px-2"
                          >
                            {isUpdatingStatus === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 
                              user.isActive ? <ShieldCheck className="h-5 w-5 text-green-500" /> : <ShieldAlert className="h-5 w-5 text-red-500" />
                            }
                            <span className="ml-2 text-xs">{user.isActive ? "Active" : "Disabled"}</span>
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                            <Button variant="outline" size="icon" onClick={() => handleViewDetails(user)} title="View/Edit Details">
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">View/Edit Details</span>
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="icon" title="Delete User" disabled={isDeleting === user.id || !user.id}>
                                  {isDeleting === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                  <span className="sr-only">Delete User</span>
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This action will delete the user's data from Firestore. Deleting from Firebase Authentication requires Admin SDK.
                                    This action cannot be undone for the Firestore record of <span className="font-semibold">{user.displayName || user.email}</span>.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel disabled={isDeleting === user.id}>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteUser(user.id)} disabled={isDeleting === user.id} className="bg-destructive hover:bg-destructive/90">
                                    {isDeleting === user.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Yes, delete user record
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile View */}
              <div className="md:hidden">
                {filteredUsers.map(renderUserCard)}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {selectedUserForModal && (
        <Dialog open={isUserDetailsModalOpen} onOpenChange={setIsUserDetailsModalOpen}>
          <DialogContent className="max-w-2xl w-[90vw] max-h-[90vh] flex flex-col p-0">
            <UserDetailsModal
              user={selectedUserForModal}
              onClose={() => setIsUserDetailsModalOpen(false)}
              onUpdateUser={handleUpdateUserFromModal}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
