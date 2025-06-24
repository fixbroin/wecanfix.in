
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PlusCircle, Edit, Trash2, Loader2, MapPin, PackageSearch } from "lucide-react";
import type { PinCodeAreaMapping } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDescriptionComponent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { nanoid } from 'nanoid';

const pinCodeRegex = /^[1-9][0-9]{5}$/; // Indian PIN code format

const pinCodeAreaSchema = z.object({
  pinCode: z.string().regex(pinCodeRegex, "PIN code must be 6 digits and not start with 0."),
  areaName: z.string().min(2, "Area name is required.").max(100, "Area name too long."),
  order: z.coerce.number().min(0, "Order must be non-negative."),
});

type PinCodeAreaFormData = z.infer<typeof pinCodeAreaSchema>;

const COLLECTION_NAME = "providerControlOptions";
const DOCUMENT_ID = "pinCodeAreaMappings";
const ARRAY_FIELD_NAME = "mappings";

export default function PinCodeManager() {
  const [mappings, setMappings] = useState<PinCodeAreaMapping[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<PinCodeAreaMapping | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<PinCodeAreaFormData>({
    resolver: zodResolver(pinCodeAreaSchema),
    defaultValues: { pinCode: "", areaName: "", order: 0 },
  });

  const fetchMappings = useCallback(async () => {
    setIsLoading(true);
    try {
      const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setMappings((data[ARRAY_FIELD_NAME] as PinCodeAreaMapping[] || []).sort((a, b) => a.order - b.order));
      } else {
        setMappings([]);
      }
    } catch (error) {
      console.error("Error fetching PIN code area mappings: ", error);
      toast({ title: "Error", description: "Could not fetch PIN code area mappings.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchMappings();
  }, [fetchMappings]);

  const handleAdd = () => {
    setEditingMapping(null);
    form.reset({ pinCode: "", areaName: "", order: mappings.length > 0 ? Math.max(...mappings.map(m => m.order)) + 1 : 0 });
    setIsFormOpen(true);
  };

  const handleEdit = (mapping: PinCodeAreaMapping) => {
    setEditingMapping(mapping);
    form.reset({ pinCode: mapping.pinCode, areaName: mapping.areaName, order: mapping.order });
    setIsFormOpen(true);
  };

  const handleDelete = async (mappingId: string) => {
    setIsSubmitting(true);
    try {
      const currentMappings = mappings.filter(m => m.id !== mappingId);
      const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
      await setDoc(docRef, { [ARRAY_FIELD_NAME]: currentMappings, updatedAt: Timestamp.now() }, { merge: true });
      setMappings(currentMappings.sort((a,b) => a.order - b.order));
      toast({ title: "Success", description: "PIN code area mapping deleted." });
    } catch (error) {
      toast({ title: "Error", description: "Could not delete mapping.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (data: PinCodeAreaFormData) => {
    setIsSubmitting(true);
    
    // Check for duplicate PIN code
    const isDuplicate = mappings.some(
      (m) => m.pinCode === data.pinCode && m.id !== editingMapping?.id
    );
    if (isDuplicate) {
      form.setError("pinCode", { type: "manual", message: "This PIN code is already mapped." });
      setIsSubmitting(false);
      return;
    }

    let updatedMappingsArray: PinCodeAreaMapping[];
    if (editingMapping) {
      updatedMappingsArray = mappings.map(m => 
        m.id === editingMapping.id ? { ...editingMapping, ...data, updatedAt: Timestamp.now() } : m
      );
    } else {
      const newMapping: PinCodeAreaMapping = {
        id: nanoid(),
        ...data,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      updatedMappingsArray = [...mappings, newMapping];
    }

    try {
      const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
      await setDoc(docRef, { [ARRAY_FIELD_NAME]: updatedMappingsArray, updatedAt: Timestamp.now() }, { merge: true });
      setMappings(updatedMappingsArray.sort((a,b) => a.order - b.order));
      toast({ title: "Success", description: `PIN code area mapping ${editingMapping ? 'updated' : 'added'}.` });
      setIsFormOpen(false);
    } catch (error) {
      toast({ title: "Error", description: `Could not save mapping.`, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-xl flex items-center"><MapPin className="mr-2 h-5 w-5"/>PIN Code Area Mappings</CardTitle>
          <CardDescription>Manage common area names associated with PIN codes.</CardDescription>
        </div>
        <Button onClick={handleAdd} disabled={isSubmitting || isLoading}>
          <PlusCircle className="mr-2 h-4 w-4" /> Add New Mapping
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : mappings.length === 0 ? (
          <div className="text-center py-10">
            <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No PIN code to area mappings defined yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>PIN Code</TableHead><TableHead>Area Name</TableHead><TableHead className="text-center">Order</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {mappings.map((mapping) => (
                <TableRow key={mapping.id}>
                  <TableCell className="font-medium">{mapping.pinCode}</TableCell>
                  <TableCell>{mapping.areaName}</TableCell>
                  <TableCell className="text-center">{mapping.order}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(mapping)} disabled={isSubmitting} className="mr-2"><Edit className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon" disabled={isSubmitting} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Confirm Deletion</AlertDialogTitle><AlertDialogDescriptionComponent>Delete mapping for PIN code "{mapping.pinCode}" ({mapping.areaName})?</AlertDialogDescriptionComponent></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(mapping.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingMapping ? "Edit" : "Add"} PIN Code Area Mapping</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
              <FormField control={form.control} name="pinCode" render={({ field }) => (<FormItem><FormLabel>PIN Code</FormLabel><FormControl><Input placeholder="e.g., 560001" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="areaName" render={({ field }) => (<FormItem><FormLabel>Common Area Name</FormLabel><FormControl><Input placeholder="e.g., MG Road Area" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="order" render={({ field }) => (<FormItem><FormLabel>Display Order</FormLabel><FormControl><Input type="number" placeholder="0" {...field} /></FormControl><FormDescription>Lower numbers appear first in any lists.</FormDescription><FormMessage /></FormItem>)} />
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline" disabled={isSubmitting}>Cancel</Button></DialogClose>
                <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
