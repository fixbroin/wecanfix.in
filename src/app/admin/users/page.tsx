
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Users, Eye, Trash2, Loader2, UserCircle, PackageSearch, ShieldCheck, ShieldAlert } from "lucide-react";
import type { FirestoreUser } from '@/types/firestore';
import { db, auth } from '@/lib/firebase'; 
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { updateProfile } from "firebase/auth"; 
import { useToast } from "@/hooks/use-toast";
import UserDetailsModal from '@/components/admin/UserDetailsModal'; 



const formatUserTimestamp = (timestamp?: Timestamp): string => {
  if (!timestamp) return 'N/A';
  return timestamp.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const { toast } = useToast();

  const [selectedUserForModal, setSelectedUserForModal] = useState<FirestoreUser | null>(null);
  const [isUserDetailsModalOpen, setIsUserDetailsModalOpen] = useState(false);

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
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-10">
              <PackageSearch className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No users found yet.</p>
            </div>
          ) : (
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
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Avatar className="h-8 w-8">
                         <AvatarImage src={user.photoURL || undefined} alt={user.displayName || user.email || "U"} />
                         <AvatarFallback className="text-xs">
                           {user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email ? user.email.charAt(0).toUpperCase() : <UserCircle size={16}/>}
                         </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium text-xs">{user.uid}</TableCell>
                    <TableCell>{user.displayName || "N/A"}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.mobileNumber || "N/A"}</TableCell>
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
    
