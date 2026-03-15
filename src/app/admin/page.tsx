
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  BarChart, DollarSign, ShoppingBag, Users, Loader2, AlertTriangle, 
  UserPlus, TagIcon, History, HandCoins, Search, TrendingUp, Plus, Calendar, ChevronRight, ArrowUpRight
} from "lucide-react";
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, Timestamp, orderBy, limit, getDocs } from "firebase/firestore";
import type { FirestoreBooking, FirestoreUser, UserActivity, FirestoreService } from '@/types/firestore';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format, formatDistanceToNow } from 'date-fns';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import AppImage from '@/components/ui/AppImage';
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import PwaInstallButton from '@/components/shared/PwaInstallButton';
import DashboardTrendingServiceCard from '@/components/admin/DashboardTrendingServiceCard';

interface DashboardStats {
  completedRevenue: number;
  totalBookings: number;
  activeUsers: number;
  newSignups: number;
  earnedCommission: number;
}

interface ActivityItem {
  id: string;
  type: 'new_booking' | 'new_user_signup';
  timestamp: Timestamp;
  title: string;
  description: string;
  icon: React.ReactElement;
  href?: string;
}

interface AnalyticsData {
  topServices: (FirestoreService & { count: number })[];
  topSearchTerms: { term: string; count: number }[];
}

const calculateProviderFee = (bookingAmount: number, feeType?: 'fixed' | 'percentage', feeValue?: number): number => {
    if (!feeType || !feeValue || feeValue <= 0) {
        return 0;
    }
    if (feeType === 'fixed') {
        return feeValue;
    }
    if (feeType === 'percentage') {
        return (bookingAmount * feeValue) / 100;
    }
    return 0;
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 24 }
  }
};

const StatCard = ({ title, value, icon: Icon, colorClass, subtitle }: { title: string, value: string | number, icon: any, colorClass: string, subtitle?: string }) => (
  <Card className="overflow-hidden border-none shadow-xl rounded-3xl group transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 bg-card">
    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-6">
      <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</CardTitle>
      <div className={cn("p-2.5 rounded-2xl transition-colors duration-300", colorClass)}>
        <Icon className="h-4 w-4" />
      </div>
    </CardHeader>
    <CardContent className="p-6 pt-0">
      <div className="text-3xl font-black tracking-tight">{value}</div>
      {subtitle && <p className="text-[10px] font-bold text-muted-foreground uppercase mt-2">{subtitle}</p>}
    </CardContent>
    <div className="h-1.5 w-full bg-muted/30">
      <div className={cn("h-full w-full", colorClass.replace('bg-', 'bg-').replace('/10', ''))} />
    </div>
  </Card>
);

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    completedRevenue: 0,
    totalBookings: 0,
    activeUsers: 0,
    newSignups: 0,
    earnedCommission: 0,
  });
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    topServices: [],
    topSearchTerms: [],
  });
  const [recentActivities, setRecentActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActivitiesLoading, setIsActivitiesLoading] = useState(true);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);
  const { config: appConfig } = useApplicationConfig();

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  }, []);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    const bookingsColRef = collection(db, "bookings");
    const usersColRef = collection(db, "users");

    let bookingsStatsLoaded = false;
    let usersStatsLoaded = false;

    const checkLoadingDone = () => {
        if (bookingsStatsLoaded && usersStatsLoaded) {
            setIsLoading(false);
        }
    };

    const unsubscribeBookingsStats = onSnapshot(bookingsColRef, (snapshot) => {
      let currentCompletedRevenue = 0;
      let currentCommission = 0;
      
      snapshot.forEach((doc) => {
        const booking = doc.data() as FirestoreBooking;
        if (booking.status === 'Completed') {
            currentCompletedRevenue += booking.totalAmount || 0;
            currentCommission += calculateProviderFee(booking.totalAmount, appConfig?.providerFeeType, appConfig?.providerFeeValue);
        }
      });

      setStats(prevStats => ({
        ...prevStats,
        completedRevenue: currentCompletedRevenue,
        totalBookings: snapshot.size,
        earnedCommission: currentCommission,
      }));
      bookingsStatsLoaded = true;
      checkLoadingDone();
    }, (err) => {
      console.error("Error fetching bookings stats:", err);
      setError("Could not load booking data.");
      bookingsStatsLoaded = true;
      checkLoadingDone();
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const unsubscribeUsersStats = onSnapshot(usersColRef, (snapshot) => {
      let currentActiveUsers = 0;
      let currentNewSignups = 0;
      snapshot.forEach((doc) => {
        const user = doc.data() as FirestoreUser;
        if (user.isActive) {
          currentActiveUsers++;
        }
        if (user.createdAt && user.createdAt.toDate() >= thirtyDaysAgo) {
          currentNewSignups++;
        }
      });
      setStats(prevStats => ({
        ...prevStats,
        activeUsers: currentActiveUsers,
        newSignups: currentNewSignups,
      }));
      usersStatsLoaded = true;
      checkLoadingDone();
    }, (err) => {
      console.error("Error fetching users stats:", err);
      setError((prevError) => prevError ? `${prevError} Could not load user data.` : "Could not load user data.");
      usersStatsLoaded = true;
      checkLoadingDone();
    });

    // Fetch Recent Activities
    setIsActivitiesLoading(true);
    setActivitiesError(null);

    const recentBookingsQuery = query(collection(db, "bookings"), orderBy("createdAt", "desc"), limit(5));
    const recentUsersQuery = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(5));

    let fetchedBookingsActivities: ActivityItem[] = [];
    let fetchedUsersActivities: ActivityItem[] = [];

    const combineAndSetActivities = () => {
        const combined = [...fetchedBookingsActivities, ...fetchedUsersActivities];
        combined.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
        setRecentActivities(combined.slice(0, 7)); 
        setIsActivitiesLoading(false);
    };
    
    let bookingsLoadedForActivity = false;
    let usersLoadedForActivity = false;

    const unsubscribeRecentBookings = onSnapshot(recentBookingsQuery, (snapshot) => {
      fetchedBookingsActivities = snapshot.docs.map(docSnap => {
        const booking = docSnap.data() as FirestoreBooking;
        return {
          id: docSnap.id,
          type: 'new_booking',
          timestamp: booking.createdAt,
          title: 'New Booking',
          description: `ID: ${booking.bookingId.substring(0,8)} • ${booking.customerName}`,
          icon: <TagIcon className="h-4 w-4 text-primary" />,
          href: `/admin/bookings/edit/${docSnap.id}`,
        };
      });
      bookingsLoadedForActivity = true;
      if (usersLoadedForActivity) combineAndSetActivities();
    }, (err) => {
      console.error("Error fetching recent bookings:", err);
      bookingsLoadedForActivity = true; 
      if (usersLoadedForActivity) combineAndSetActivities(); 
    });

    const unsubscribeRecentUsers = onSnapshot(recentUsersQuery, (snapshot) => {
      fetchedUsersActivities = snapshot.docs.map(docSnap => {
        const user = docSnap.data() as FirestoreUser;
        return {
          id: docSnap.id,
          type: 'new_user_signup',
          timestamp: user.createdAt,
          title: 'New User Signup',
          description: `${user.displayName || user.email}`,
          icon: <UserPlus className="h-4 w-4 text-emerald-500" />,
          href: `/admin/users`, 
        };
      });
      usersLoadedForActivity = true;
      if (bookingsLoadedForActivity) combineAndSetActivities();
    }, (err) => {
      console.error("Error fetching recent users:", err);
      usersLoadedForActivity = true;
      if (bookingsLoadedForActivity) combineAndSetActivities();
    });

    // Fetch Analytics Data
    const fetchAnalytics = async () => {
        setIsAnalyticsLoading(true);
        try {
            const servicesSnapshot = await getDocs(collection(db, "adminServices"));
            const servicesDataMap = new Map(servicesSnapshot.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() } as FirestoreService]));

            const bookingsSnapshot = await getDocs(collection(db, "bookings"));
            const serviceCounts: { [key: string]: number } = {};
            bookingsSnapshot.forEach(doc => {
                const booking = doc.data() as FirestoreBooking;
                booking.services.forEach(service => {
                    serviceCounts[service.serviceId] = (serviceCounts[service.serviceId] || 0) + service.quantity;
                });
            });

            const topServices = Object.entries(serviceCounts)
                .map(([serviceId, count]) => {
                    const serviceDetails = servicesDataMap.get(serviceId);
                    return serviceDetails ? { ...serviceDetails, count } : null;
                })
                .filter((item): item is FirestoreService & { count: number } => item !== null)
                .sort((a, b) => b.count - a.count);

            const searchActivitiesQuery = query(collection(db, "userActivities"), where("eventType", "==", "search"), limit(500));
            const persistentSearchQuery = query(collection(db, "searchAnalytics"), limit(1000));
            
            const [searchActivitiesSnapshot, persistentSearchSnapshot] = await Promise.all([
                getDocs(searchActivitiesQuery),
                getDocs(persistentSearchQuery)
            ]);

            const searchCounts: { [key: string]: number } = {};
            searchActivitiesSnapshot.forEach(doc => {
                const activity = doc.data() as UserActivity;
                const term = activity.eventData?.searchQuery?.toLowerCase().trim();
                if (term) searchCounts[term] = (searchCounts[term] || 0) + 1;
            });
            persistentSearchSnapshot.forEach(doc => {
                const data = doc.data();
                const term = data.term?.toLowerCase().trim();
                if (term) searchCounts[term] = (searchCounts[term] || 0) + 1;
            });

            const topSearchTerms = Object.entries(searchCounts).sort(([, a], [, b]) => b - a).map(([term, count]) => ({ term, count }));
            setAnalytics({ topServices, topSearchTerms });

        } catch(e) {
             console.error("Error fetching analytics data:", e);
        } finally {
            setIsAnalyticsLoading(false);
        }
    };
    fetchAnalytics();

    return () => {
      unsubscribeBookingsStats();
      unsubscribeUsersStats();
      unsubscribeRecentBookings();
      unsubscribeRecentUsers();
    };
  }, [appConfig]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary/40" />
        <p className="text-sm font-medium text-muted-foreground animate-pulse">Initializing Control Center...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 max-w-md mx-auto">
        <div className="p-4 bg-destructive/10 rounded-full">
          <AlertTriangle className="h-12 w-12 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">System Sync Failed</h2>
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={() => window.location.reload()} variant="outline">Retry Synchronization</Button>
      </div>
    );
  }

  return (
    <motion.div 
      initial="hidden" 
      animate="visible" 
      variants={containerVariants}
      className="space-y-8 pb-10"
    >
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-2">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-primary">
            <TrendingUp className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Real-time Insights</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight">{greeting}, Admin</h1>
          <div className="flex items-center space-x-2 text-muted-foreground text-sm font-medium">
             <Calendar className="h-4 w-4" />
             <span>{format(new Date(), 'EEEE, MMMM do yyyy')}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PwaInstallButton />
          <Link href="/admin/bookings" passHref>
            <Button className="rounded-2xl h-12 px-6 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" /> Create Booking
            </Button>
          </Link>
          <Button variant="outline" className="rounded-2xl h-12 w-12 p-0 border-primary/20 text-primary">
            <ArrowUpRight className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
        <motion.div variants={itemVariants}>
          <StatCard 
            title="Revenue" 
            value={`₹${stats.completedRevenue.toLocaleString()}`} 
            icon={DollarSign} 
            colorClass="bg-blue-500/10 text-blue-500" 
            subtitle="Total Completed Sales"
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard 
            title="Earnings" 
            value={`₹${stats.earnedCommission.toLocaleString(undefined, {maximumFractionDigits: 0})}`} 
            icon={HandCoins} 
            colorClass="bg-primary/10 text-primary" 
            subtitle="Net Platform Profit"
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard 
            title="Orders" 
            value={stats.totalBookings} 
            icon={ShoppingBag} 
            colorClass="bg-amber-500/10 text-amber-500" 
            subtitle="Total System Bookings"
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard 
            title="Active Base" 
            value={stats.activeUsers} 
            icon={Users} 
            colorClass="bg-emerald-500/10 text-emerald-500" 
            subtitle="Verified Active Users"
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard 
            title="Growth" 
            value={`+${stats.newSignups}`} 
            icon={UserPlus} 
            colorClass="bg-indigo-500/10 text-indigo-500" 
            subtitle="New signups (30d)"
          />
        </motion.div>
      </div>

      <div className="grid gap-8 grid-cols-1 lg:grid-cols-3">
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="h-full border-none shadow-xl rounded-3xl overflow-hidden bg-card">
            <CardHeader className="p-8 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-black tracking-tight flex items-center">
                    <History className="mr-3 h-6 w-6 text-primary" /> Live Activity
                  </CardTitle>
                  <CardDescription className="font-medium">Real-time system events and interactions</CardDescription>
                </div>
                <Link href="/admin/activity-feed" className="text-xs font-black text-primary uppercase tracking-widest hover:underline">View All</Link>
              </div>
            </CardHeader>
            <CardContent className="p-8 pt-4">
              {isActivitiesLoading ? (
                <div className="flex flex-col justify-center items-center h-64 space-y-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary/30" />
                  <p className="text-xs font-bold text-muted-foreground uppercase">Syncing Feed...</p>
                </div>
              ) : (
                <div className="relative space-y-8">
                  <div className="absolute left-6 top-2 bottom-2 w-0.5 bg-muted/50" />
                  {recentActivities.map((activity) => (
                    <Link key={activity.id} href={activity.href || '#'} className="relative flex items-center group">
                      <div className="z-10 flex h-12 w-12 items-center justify-center rounded-2xl bg-card border-2 border-muted shadow-sm group-hover:border-primary/50 group-hover:scale-110 transition-all duration-300">
                        {activity.icon}
                      </div>
                      <div className="ml-6 flex-grow p-4 rounded-2xl bg-muted/30 border border-border/40 group-hover:bg-primary/[0.03] group-hover:border-primary/10 transition-all duration-300 shadow-sm">
                        <div className="flex justify-between items-center mb-1">
                          <p className="text-sm font-bold tracking-tight">{activity.title}</p>
                          <span className="text-[10px] font-black text-muted-foreground uppercase bg-background/80 px-2 py-0.5 rounded-full border shadow-sm">
                            {formatDistanceToNow(activity.timestamp.toDate(), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground font-medium">{activity.description}</p>
                      </div>
                      <ChevronRight className="ml-4 h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-all" />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
        
        <div className="space-y-8">
          <motion.div variants={itemVariants}>
            <Card className="border-none shadow-xl rounded-3xl bg-card">
              <CardHeader className="p-8 pb-4">
                <CardTitle className="text-xl font-black tracking-tight flex items-center">
                  <TrendingUp className="mr-3 h-5 w-5 text-primary"/> Trending Services
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-8 pt-0">
                {isAnalyticsLoading ? (
                  <div className="h-40 flex items-center justify-center"><Loader2 className="animate-spin text-primary/30"/></div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="flex flex-col gap-3 pr-4 pb-4">
                      {analytics.topServices.map((service, idx) => (
                        <DashboardTrendingServiceCard 
                          key={service.id} 
                          service={service} 
                          rank={idx + 1} 
                          maxCount={analytics.topServices[0]?.count || 1} 
                        />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="border-none shadow-xl rounded-3xl bg-card">
              <CardHeader className="p-8 pb-4">
                <CardTitle className="text-xl font-black tracking-tight flex items-center">
                  <Search className="mr-3 h-5 w-5 text-primary"/> Search Hotspots
                </CardTitle>
              </CardHeader>
              <CardContent className="p-8 pt-0">
                {isAnalyticsLoading ? (
                  <div className="h-40 flex items-center justify-center"><Loader2 className="animate-spin text-primary/30"/></div>
                ) : (
                  <ScrollArea className="h-[300px]">
                    <div className="flex flex-wrap gap-2 pr-4">
                      {analytics.topSearchTerms.map((s, idx) => (
                        <div 
                          key={s.term} 
                          className={cn(
                            "px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-tight transition-all cursor-default",
                            idx === 0 ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 hover:bg-muted"
                          )}
                        >
                          {s.term} <span className="ml-1 opacity-50">• {s.count}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
