
"use client";

import { useState, useEffect } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Input } from '@/components/ui/input';
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Loader2, SendHorizonal, AlertTriangle, XCircle } from "lucide-react"; 
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, setDoc, Timestamp } from "firebase/firestore";
import type { GlobalWebSettings, GlobalAdminPopup } from '@/types/firestore';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";


const globalMessageFormSchema = z.object({
  message: z.string().min(5, "Message must be at least 5 characters.").max(250, "Message cannot exceed 250 characters."),
  durationSeconds: z.coerce.number().min(3, "Duration must be at least 3 seconds.").max(60, "Duration cannot exceed 60 seconds.").optional().default(10),
  isActive: z.boolean().default(false), // To control if it's actively shown or just saved
});

type GlobalMessageFormData = z.infer<typeof globalMessageFormSchema>;

export default function AdminGlobalMessageForm() {
  const { toast } = useToast();
  const { settings: globalSettings, isLoading: isLoadingGlobalSettings } = useGlobalSettings();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<GlobalMessageFormData>({
    resolver: zodResolver(globalMessageFormSchema),
    defaultValues: {
      message: "",
      durationSeconds: 10,
      isActive: false,
    },
  });

  useEffect(() => {
    if (globalSettings?.globalAdminPopup && !isLoadingGlobalSettings) {
      form.reset({
        message: globalSettings.globalAdminPopup.message || "",
        durationSeconds: globalSettings.globalAdminPopup.durationSeconds || 10,
        isActive: globalSettings.globalAdminPopup.isActive || false,
      });
    }
  }, [globalSettings, isLoadingGlobalSettings, form]);

  const onSubmit = async (data: GlobalMessageFormData) => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, "webSettings", "global");
      const popupDataToSave: GlobalAdminPopup = {
        message: data.message,
        isActive: true, // Sending always means activating it
        durationSeconds: data.durationSeconds,
        sentAt: Timestamp.now(),
      };
      await setDoc(settingsDocRef, { globalAdminPopup: popupDataToSave, updatedAt: Timestamp.now() }, { merge: true });
      toast({ title: "Success", description: "Global popup message has been sent to active users." });
      form.setValue("isActive", true); // Reflect that it's now active
    } catch (error) {
      console.error("Error sending global popup message:", error);
      toast({ title: "Error", description: "Could not send global popup message.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleDeactivatePopup = async () => {
    setIsSaving(true);
    try {
        const settingsDocRef = doc(db, "webSettings", "global");
        const currentPopupSettings = globalSettings?.globalAdminPopup || { message: "", isActive: false, durationSeconds: 10 };
        await setDoc(settingsDocRef, { 
            globalAdminPopup: { ...currentPopupSettings, isActive: false, sentAt: Timestamp.now() },
            updatedAt: Timestamp.now() 
        }, { merge: true });
        toast({ title: "Popup Deactivated", description: "Global popup message has been turned off." });
        form.setValue("isActive", false);
    } catch (error) {
        console.error("Error deactivating global popup:", error);
        toast({ title: "Error", description: "Could not deactivate global popup.", variant: "destructive" });
    } finally {
        setIsSaving(false);
    }
  };


  if (isLoadingGlobalSettings) {
    return (
      <Card>
        <CardHeader><CardTitle>Send Global Popup Message</CardTitle></CardHeader>
        <CardContent className="flex justify-center items-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2 text-muted-foreground">Loading current popup status...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Send Global Popup Message</CardTitle>
            <CardDescription>
              Broadcast a short message that will appear as a popup to all active frontend users.
              It will show for the specified duration. Sending a new message replaces any active one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Popup Message</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g., Special offer! Use code SUMMER20 for 20% off. Ends soon!"
                      {...field}
                      rows={4}
                      disabled={isSaving}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="durationSeconds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Duration (seconds)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 10" {...field} disabled={isSaving} />
                  </FormControl>
                  <FormDescription>How long the popup will stay on screen (3-60 seconds).</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
             {form.getValues("isActive") && globalSettings?.globalAdminPopup?.isActive && (
                <Alert variant="default" className="bg-primary/10 border-primary/30 text-primary">
                    <AlertTriangle className="h-4 w-4 !text-primary" />
                    <AlertTitle>Popup Currently Active</AlertTitle>
                    <AlertDescription>
                       A global popup message is currently active: "{globalSettings.globalAdminPopup.message}". Sending a new one will replace it.
                       You can also choose to deactivate the current one.
                    </AlertDescription>
                </Alert>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3 sm:flex-row sm:justify-end sm:gap-2">
            {form.getValues("isActive") && globalSettings?.globalAdminPopup?.isActive && (
                <Button type="button" variant="destructive" onClick={handleDeactivatePopup} disabled={isSaving} className="w-full sm:w-auto">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                    Deactivate Current Popup
                </Button>
            )} 
            
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button type="button" disabled={isSaving || !form.formState.isValid} className="w-full sm:w-auto">
                        <SendHorizonal className="mr-2 h-4 w-4" /> Send/Activate Popup
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Send Popup?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will display the message "{form.getValues("message").substring(0,50)}..." to all active users for {form.getValues("durationSeconds")} seconds.
                        Are you sure you want to send it?
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={form.handleSubmit(onSubmit)} disabled={isSaving}>
                         {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Yes, Send Popup
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}

    