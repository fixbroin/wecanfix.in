

      
"use client"

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
import { LayoutGrid, List, Layers, Settings, Users, ShoppingBag, Tag, BarChart3, PlaySquare, Settings2, HelpCircle, MessageSquare, ListChecks, Percent, UserCircle as UserProfileIcon, Target, Map, HandCoins, Megaphone, Bell, Activity, Palette, MessageCircle as ChatIcon, Mail, Zap, Receipt, Tv, Users2, MapPin, Cookie, Globe2, KeyRound, Database, FileText, Construction, Handshake, Banknote } from 'lucide-react';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { useLoading } from '@/contexts/LoadingContext';

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutGrid },
  { href: '/admin/profile', label: 'Admin Profile', icon: UserProfileIcon },
  { href: '/admin/notifications', label: 'Admin Notifications', icon: Bell },
  { href: '/admin/activity-feed', label: 'Activity Feed', icon: Activity },
  { type: 'separator', label: 'Core Management' },
  { href: '/admin/bookings', label: 'Bookings', icon: Tag },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/inquiries', label: 'Inquiries', icon: Mail },
  { href: '/admin/chat', label: 'Chat Management', icon: ChatIcon },
  { href: '/admin/custom-service', label: 'Custom Requests', icon: Construction },
  { type: 'separator', label: 'Provider Management' },
  { href: '/admin/provider-applications', label: 'Provider Applications', icon: Users2 },
  { href: '/admin/provider-withdrawals', label: 'Provider Withdrawals', icon: Banknote },
  { href: '/admin/provider-controls', label: 'Provider Controls', icon: Settings },
  { type: 'separator', label: 'Content Management' },
  { href: '/admin/categories', label: 'Categories', icon: List },
  { href: '/admin/sub-categories', label: 'Sub-Categories', icon: Layers },
  { href: '/admin/services', label: 'Services', icon: ShoppingBag },
  { href: '/admin/slideshows', label: 'Slideshows', icon: PlaySquare },
  { href: '/admin/blog', label: 'Blog', icon: FileText },
  { href: '/admin/reviews', label: 'Reviews', icon: MessageSquare },
  { href: '/admin/faq', label: 'FAQ', icon: HelpCircle },
  { type: 'separator', label: 'Location & SEO' },
  { href: '/admin/cities', label: 'Cities', icon: Map },
  { href: '/admin/areas', label: 'Areas', icon: MapPin },
  { href: '/admin/service-zones', label: 'Service Zones', icon: Globe2 },
  { href: '/admin/seo-settings', label: 'Global SEO Patterns', icon: Target },
  { href: '/admin/seo-overrides', label: 'Advanced SEO', icon: Zap },
  { type: 'separator', label: 'Operations & Finance' },
  { href: '/admin/referral-settings', label: 'Referral System', icon: Handshake },
  { href: '/admin/quotation-invoice', label: 'Quotation & Invoice', icon: Receipt },
  { href: '/admin/taxes', label: 'Tax Configurations', icon: Percent },
  { href: '/admin/platform-settings', label: 'Platform Fees', icon: HandCoins },
  { href: '/admin/time-slots', label: 'Time Slot Limits', icon: ListChecks },
  { href: '/admin/reports', label: 'Booking Reports', icon: BarChart3 },
  { href: '/admin/visitor-info', label: 'Visitor Info', icon: Globe2 },
  { type: 'separator', label: 'Homepage & Marketing' },
  { href: '/admin/features', label: 'Homepage Features', icon: Tv },
  { href: '/admin/marketing-settings', label: 'Marketing IDs', icon: Megaphone },
  { href: '/admin/marketing-automation', label: 'Marketing Automation', icon: Megaphone },
  { href: '/admin/whatsapp-settings', label: 'WhatsApp Settings', icon: MessageSquare },
  { href: '/admin/newsletter-popups', label: 'Newsletter Popups', icon: Megaphone },
  { href: '/admin/promo-codes', label: 'Promo Codes', icon: Percent },
  { type: 'separator', label: 'System Settings' },
  { href: '/admin/theme-settings', label: 'Theme Settings', icon: Palette },
  { href: '/admin/settings', label: 'App Settings', icon: Settings },
  { href: '/admin/login-settings', label: 'Login Settings', icon: KeyRound },
  { href: '/admin/web-settings', label: 'Web Settings', icon: Settings2 },
  { href: '/admin/cookie-settings', label: 'Cookie Settings', icon: Cookie },
  { href: '/admin/database-tools', label: 'Database Tools', icon: Database },
];

export default function AdminSidebarContent() {
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

  const uniqueTopLevelAdminPages = [
    '/admin', '/admin/profile', '/admin/notifications', '/admin/activity-feed',
    '/admin/theme-settings', '/admin/newsletter-popups', '/admin/chat', '/admin/inquiries',
    '/admin/seo-overrides', '/admin/quotation-invoice', '/admin/features',
    '/admin/provider-controls', 
    '/admin/provider-applications', 
    '/admin/cookie-settings', 
    '/admin/visitor-info',
    '/admin/login-settings',
    '/admin/database-tools',
    '/admin/service-zones',
    '/admin/blog',
    '/admin/custom-service',
    '/admin/marketing-automation',
    '/admin/marketing-settings', // Corrected from marketing-automation again
    '/admin/whatsapp-settings',
    '/admin/referral-settings',
    '/admin/provider-withdrawals', // Added new page
    '/admin/reviews', // Added reviews
  ];


  return (
    <>
      <SidebarHeader className="p-4 border-b">
        <Logo
          logoUrl={globalSettings?.logoUrl}
          websiteName={globalSettings?.websiteName}
          size="normal"
          href="/admin"
        />
      </SidebarHeader>
      <SidebarContent className="pb-4">
        <SidebarMenu>
          {navItems.map((item, index) => {
            if (item.type === 'separator') {
              return (
                <div key={`sep-${index}`} className="px-2 py-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{item.label}</span>
                </div>
              );
            }
            let isActiveRoute = pathname === item.href;
            if (uniqueTopLevelAdminPages.includes(item.href!)) {
                isActiveRoute = pathname === item.href;
            } else if (item.href !== '/admin') {
                isActiveRoute = pathname.startsWith(item.href!);
            }

            const IconComponent = item.icon; // Assign to a variable to use as a component

            return (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href!} passHref legacyBehavior>
                <SidebarMenuButton
                  isActive={isActiveRoute}
                  tooltip={{ children: item.label, side: 'right', align: 'center' }}
                  onClick={handleLinkClick}
                >
                  {IconComponent && <IconComponent />} 
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          );
        })}
        </SidebarMenu>
      </SidebarContent>
    </>
  );
}

    
