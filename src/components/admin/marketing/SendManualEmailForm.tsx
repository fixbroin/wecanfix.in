
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Users, UserSearch, Copy, Tag } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, where, limit } from "firebase/firestore";
import type { FirestoreUser } from '@/types/firestore';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { sendBulkMarketingEmail } from '@/ai/flows/sendBulkMarketingEmailFlow';

const sendEmailFormSchema = z.object({
  targetAudience: z.enum(['all', 'specific'], { required_error: "Please select an audience."}),
  userIds: z.array(z.string()).optional(),
  subject: z.string().min(5, "Subject must be at least 5 characters."),
  body: z.string().min(20, "Email body must be at least 20 characters."),
});
type SendEmailFormData = z.infer<typeof sendEmailFormSchema>;

const mergeTags = [
    { tag: '{{name}}', label: 'Full Name' },
    { tag: '{{email}}', label: 'Email Address' },
    { tag: '{{mobile}}', label: 'Mobile Number' },
    { tag: '{{signupDate}}', label: 'Signup Date' },
    { tag: '{{websiteName}}', label: 'Website Name' },
    { tag: '{{websiteUrl}}', label: 'Website URL' },
    { tag: '{{supportEmail}}', label: 'Support Email' },
    { tag: '{{companyAddress}}', label: 'Company Address' },
];

export default function SendManualEmailForm() {
  const { toast } = useToast();
  const { settings: globalSettings, isLoading: isLoadingGlobalSettings } = useGlobalSettings();
  const [isSending, setIsSending] = useState(false);
  const [allUsers, setAllUsers] = useState<FirestoreUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<FirestoreUser | null>(null);

  const form = useForm<SendEmailFormData>({
    resolver: zodResolver(sendEmailFormSchema),
    defaultValues: { targetAudience: 'all', userIds: [], subject: "", body: "" },
  });

  const watchedTargetAudience = form.watch('targetAudience');

  useEffect(() => {
    if (watchedTargetAudience === 'specific' && allUsers.length === 0) {
      const fetchUsers = async () => {
        setIsLoadingUsers(true);
        try {
          const usersQuery = query(collection(db, "users"), orderBy("displayName", "asc"));
          const snapshot = await getDocs(usersQuery);
          setAllUsers(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreUser)));
        } catch (error) { toast({ title: "Error", description: "Could not load users.", variant: "destructive" }); }
        finally { setIsLoadingUsers(false); }
      };
      fetchUsers();
    }
    if (watchedTargetAudience === 'all') {
        setSelectedUser(null);
        form.setValue('userIds', []);
    }
  }, [watchedTargetAudience, allUsers.length, toast, form]);
  
  const filteredUsers = userSearchTerm
    ? allUsers.filter(user =>
        (user.displayName && user.displayName.toLowerCase().includes(userSearchTerm.toLowerCase())) ||
        (user.email && user.email.toLowerCase().includes(userSearchTerm.toLowerCase())) ||
        (user.mobileNumber && user.mobileNumber.includes(userSearchTerm))
      ).slice(0, 5) // Limit to 5 results for performance
    : [];

  const handleUserSelect = (user: FirestoreUser) => {
    setSelectedUser(user);
    setUserSearchTerm('');
    form.setValue('userIds', [user.id]);
  };
  
  const handleCopyTag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    toast({ description: `Copied "${tag}" to clipboard.` });
  };
  
  const onSubmit = async (data: SendEmailFormData) => {
    setIsSending(true);
    toast({ title: "Sending Email(s)...", description: "This may take a moment for bulk sends."});
    try {
        const targetUserIds = data.targetAudience === 'all' ? 'all' : (selectedUser ? [selectedUser.id] : []);
        if (targetUserIds.length === 0 && data.targetAudience === 'specific') {
            toast({ title: "Error", description: "Please select a user to send the email to.", variant: "destructive"});
            setIsSending(false);
            return;
        }

        const result = await sendBulkMarketingEmail({
            targetUserIds,
            subject: data.subject,
            body: data.body,
        });
        
        if (result.success) {
            toast({ title: "Success!", description: result.message, className: "bg-green-100 border-green-300 text-green-700" });
            form.reset({ targetAudience: 'all', userIds: [], subject: "", body: "" });
            setSelectedUser(null);
        } else {
            throw new Error(result.message);
        }

    } catch (error) {
      console.error("Error sending manual email:", error);
      toast({ title: "Error", description: (error as Error).message || "An unknown error occurred.", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Send Manual Email Campaign</CardTitle>
            <CardDescription>Compose and send an email to all or specific users.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="targetAudience"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Select Audience</FormLabel>
                  <FormControl>
                    <RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-col sm:flex-row gap-4" disabled={isSending}>
                      <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="all" /></FormControl><FormLabel className="font-normal flex items-center"><Users className="mr-2 h-4 w-4"/>All Users</FormLabel></FormItem>
                      <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="specific" /></FormControl><FormLabel className="font-normal flex items-center"><UserSearch className="mr-2 h-4 w-4"/>Specific User</FormLabel></FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {watchedTargetAudience === 'specific' && (
              <div className="relative">
                <FormLabel>Search for User</FormLabel>
                <Input placeholder="Search by name, email, or mobile..." value={userSearchTerm} onChange={(e) => setUserSearchTerm(e.target.value)} disabled={isSending || isLoadingUsers} />
                {selectedUser && (
                    <div className="mt-2 p-2 border rounded-md bg-muted text-sm">Selected: <span className="font-semibold">{selectedUser.displayName}</span> ({selectedUser.email}) <Button variant="ghost" size="sm" className="ml-2 h-6" onClick={() => setSelectedUser(null)}>Clear</Button></div>
                )}
                {userSearchTerm && filteredUsers.length > 0 && (
                  <ScrollArea className="absolute z-10 w-full bg-card border rounded-md shadow-lg mt-1 max-h-48">
                    {filteredUsers.map(user => (
                      <div key={user.id} onClick={() => handleUserSelect(user)} className="p-2 hover:bg-accent cursor-pointer text-sm">
                        {user.displayName} - {user.mobileNumber || user.email}
                      </div>
                    ))}
                  </ScrollArea>
                )}
                {isLoadingUsers && <Loader2 className="h-4 w-4 animate-spin mt-2" />}
              </div>
            )}
            <FormField control={form.control} name="subject" render={({ field }) => (<FormItem><FormLabel>Subject</FormLabel><FormControl><Input placeholder="Your Email Subject" {...field} disabled={isSending} /></FormControl><FormMessage /></FormItem>)} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="body"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Email Body</FormLabel>
                    <FormControl><Textarea placeholder="Hi {{name}}, ... (HTML is supported)" {...field} rows={12} disabled={isSending} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Card className="p-3 bg-muted/50">
                <CardHeader className="p-1 pb-2"><CardTitle className="text-sm font-medium flex items-center"><Tag className="mr-2 h-4 w-4"/>Merge Tags</CardTitle></CardHeader>
                <CardContent className="p-1">
                  <p className="text-xs text-muted-foreground mb-2">Click to copy a tag.</p>
                  <div className="space-y-1">
                    {mergeTags.map(tag => (
                      <Button key={tag.tag} type="button" variant="ghost" size="sm" className="w-full justify-start text-xs h-7" onClick={() => handleCopyTag(tag.tag)}>
                        <Copy className="mr-2 h-3 w-3" />
                        <span className="font-mono">{tag.tag}</span>
                        <span className="text-muted-foreground ml-2">({tag.label})</span>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSending || isLoadingGlobalSettings}>
              {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send Email
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
