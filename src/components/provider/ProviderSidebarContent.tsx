
"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar';
import Logo from '@/components/shared/Logo';
import { LayoutDashboard, UserCog, Briefcase, DollarSign, Star, Bell, ReceiptText, Banknote } from 'lucide-react';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { useLoading } from '@/contexts/LoadingContext';

const navItems = [
  { href: '/provider', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/provider/profile', label: 'Profile & Settings', icon: UserCog },
  { href: '/provider/my-jobs', label: 'My Jobs', icon: Briefcase },
  { href: '/provider/quotation-invoice', label: 'Quotation & Invoice', icon: ReceiptText },
  { href: '/provider/earnings', label: 'Earnings', icon: DollarSign },
  { href: '/provider/withdrawal', label: 'Withdrawal', icon: Banknote },
  { href: '/provider/reviews', label: 'My Reviews', icon: Star },
  { href: '/provider/notifications', label: 'Notifications', icon: Bell },
];

export default function ProviderSidebarContent() {
  const pathname = usePathname();
  const { settings: globalSettings } = useGlobalSettings();
  const { isMobile, setOpenMobile } = useSidebar();
  const { showLoading } = useLoading();

  const handleLinkClick = () => {
    showLoading();
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <>
      <SidebarHeader className="p-4 border-b">
        <Logo
          logoUrl={globalSettings?.logoUrl}
          websiteName={globalSettings?.websiteName}
          size="normal"
          href="/provider" // Link logo to provider dashboard
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {navItems.map((item, index) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href!} passHref legacyBehavior>
                <SidebarMenuButton
                  isActive={pathname === item.href}
                  tooltip={{ children: item.label, side: 'right', align: 'center' }}
                  onClick={handleLinkClick}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
    </>
  );
}

    
