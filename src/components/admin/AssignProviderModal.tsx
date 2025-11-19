
"use client";

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, UserCheck2, UserCircle, PackageSearch } from "lucide-react";
import type { ProviderApplication } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface AssignProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  bookingHumanId: string;
  onAssignConfirm: (bookingId: string, providerId: string, providerName: string) => Promise<void>;
}

export default function AssignProviderModal({ isOpen, onClose, bookingId, bookingHumanId, onAssignConfirm }: AssignProviderModalProps) {
  const [providers, setProviders] = useState<ProviderApplication[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | undefined>(undefined);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [isAssigning, setIsAssigning] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) {
      setSelectedProviderId(undefined); // Reset selection when modal closes
      return;
    }
    
    const fetchApprovedProviders = async () => {
      setIsLoadingProviders(true);
      try {
        const providersRef = collection(db, "providerApplications");
        const q = query(providersRef, where("status", "==", "approved"), orderBy("fullName", "asc"));
        const snapshot = await getDocs(q);
        const approvedProviders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProviderApplication));
        setProviders(approvedProviders);
      } catch (error) {
        console.error("Error fetching approved providers:", error);
        toast({ title: "Error", description: "Could not load available providers.", variant: "destructive" });
      } finally {
        setIsLoadingProviders(false);
      }
    };

    fetchApprovedProviders();
  }, [isOpen, toast]);

  const handleConfirm = async () => {
    if (!selectedProviderId) {
      toast({ title: "Selection Required", description: "Please select a provider to assign.", variant: "default" });
      return;
    }
    const selectedProvider = providers.find(p => p.id === selectedProviderId);
    if (!selectedProvider) {
        toast({ title: "Error", description: "Selected provider not found.", variant: "destructive"});
        return;
    }

    setIsAssigning(true);
    await onAssignConfirm(bookingId, selectedProviderId, selectedProvider.fullName || "Unknown Provider");
    setIsAssigning(false);
    // onClose will be called by the parent upon successful assignment (or if parent decides to close it)
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md md:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <UserCheck2 className="mr-2 h-5 w-5 text-primary"/> Assign Provider to Booking <span className="text-sm text-muted-foreground ml-1">#{bookingHumanId}</span>
          </DialogTitle>
          <DialogDescription>
            Select an approved provider from the list below to assign this booking.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-grow overflow-hidden">
          {isLoadingProviders ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : providers.length === 0 ? (
            <div className="text-center py-10">
              <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No approved providers found.</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(80vh-200px)] pr-3"> {/* Adjust max height as needed */}
              <RadioGroup value={selectedProviderId} onValueChange={setSelectedProviderId}>
                <Table>
                  <TableBody>
                    {providers.map((provider) => (
                      <TableRow key={provider.id} className="cursor-pointer hover:bg-accent/50 data-[state=checked]:bg-accent" onClick={() => setSelectedProviderId(provider.id)}>
                        <TableCell className="w-10 p-2">
                          <RadioGroupItem value={provider.id!} id={`provider-${provider.id}`} />
                        </TableCell>
                        <TableCell className="p-2">
                          <Label htmlFor={`provider-${provider.id}`} className="flex items-center gap-2 cursor-pointer">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={provider.profilePhotoUrl || undefined} alt={provider.fullName} />
                              <AvatarFallback>{provider.fullName ? provider.fullName[0].toUpperCase() : <UserCircle />}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-sm">{provider.fullName}</div>
                              <div className="text-xs text-muted-foreground">{provider.workCategoryName || "N/A"}</div>
                            </div>
                          </Label>
                        </TableCell>
                        <TableCell className="p-2 text-xs text-muted-foreground text-right">{provider.mobileNumber}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </RadioGroup>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="pt-4 border-t">
          <Button type="button" variant="outline" onClick={onClose} disabled={isAssigning}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!selectedProviderId || isAssigning || isLoadingProviders}>
            {isAssigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Assign to Provider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
