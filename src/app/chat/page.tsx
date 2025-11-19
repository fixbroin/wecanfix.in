
"use client";

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import ChatWindow from "@/components/chat/ChatWindow";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import type { BreadcrumbItem } from "@/types/ui";
import { Button } from "@/components/ui/button";
import { Home as HomeIcon } from "lucide-react";
import { useLoading } from '@/contexts/LoadingContext';

export default function FullPageChat() {
  const router = useRouter();
  const { showLoading } = useLoading();

  const handleCloseChatWindow = () => {
    showLoading();
    router.push('/'); // Or router.back() if preferred
  };

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Chat with Support" },
  ];

  return (
    <ProtectedRoute>
      <div className="container mx-auto px-2 sm:px-4 py-6 sm:py-8">
        <Breadcrumbs items={breadcrumbItems} />
        <div className="flex justify-between items-center mb-4 sm:mb-6">
            <h1 className="text-2xl sm:text-3xl font-headline font-semibold text-foreground">
            Chat with Support
            </h1>
            <Link href="/" passHref>
                 <Button variant="outline" size="sm" onClick={() => showLoading()}>
                   <HomeIcon className="mr-2 h-4 w-4" /> Back to Home
                 </Button>
            </Link>
        </div>
        <div className="h-[calc(100vh-15rem)] sm:h-[calc(100vh-16rem)] md:h-[calc(100vh-18rem)]"> {/* Adjust height as needed */}
          <ChatWindow onClose={handleCloseChatWindow} />
        </div>
      </div>
    </ProtectedRoute>
  );
}
