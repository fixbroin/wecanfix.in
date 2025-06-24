
"use client";

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageCircle, Users, Settings, Send } from 'lucide-react';
import ChatSettingsForm from '@/components/admin/ChatSettingsForm';
import AdminUserListForChat from '@/components/admin/AdminUserListForChat';
import AdminChatMessageArea from '@/components/admin/AdminChatMessageArea';
import AdminGlobalMessageForm from '@/components/admin/AdminGlobalMessageForm';
import type { FirestoreUser } from '@/types/firestore';

export default function AdminChatPage() {
  const [selectedChatUser, setSelectedChatUser] = useState<FirestoreUser | null>(null);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <MessageCircle className="mr-2 h-6 w-6 text-primary" /> Chat Management
          </CardTitle>
          <CardDescription>
            Configure chat settings, manage user conversations, and send global popup messages.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="settings" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="settings"><Settings className="mr-2 h-4 w-4"/>Settings</TabsTrigger>
          <TabsTrigger value="user_chats"><Users className="mr-2 h-4 w-4"/>User Chats</TabsTrigger>
          <TabsTrigger value="global_popup"><Send className="mr-2 h-4 w-4"/>Global Popup</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <ChatSettingsForm />
        </TabsContent>

        <TabsContent value="user_chats">
          <Card>
            <CardHeader>
              <CardTitle>User Conversations</CardTitle>
              <CardDescription>Select a user to view and manage their chat history.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <AdminUserListForChat onSelectUser={setSelectedChatUser} selectedUserId={selectedChatUser?.id} />
              </div>
              <div className="md:col-span-2 h-[600px]"> {/* Explicit height for chat area container */}
                <AdminChatMessageArea selectedUser={selectedChatUser} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="global_popup">
          <AdminGlobalMessageForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
