
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, DollarSign, ShoppingBag, Users, Loader2, AlertTriangle, UserPlus, TagIcon, History, HandCoins, Search } from "lucide-react";
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, Timestamp, orderBy, limit, getDocs } from "firebase/firestore";
import type { FirestoreBooking, FirestoreUser, UserActivity, FirestoreService } from '@/types/firestore';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import Image from 'next/image';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";

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
      console.error("Error fetching bookings for dashboard stats:", err);
      setError("Could not load booking data.");
      bookingsStatsLoaded = true;
      checkLoadingDone();
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoTimestamp = Timestamp.fromDate(thirtyDaysAgo);

    const usersQuery = query(usersColRef);
    const unsubscribeUsersStats = onSnapshot(usersQuery, (snapshot) => {
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
      console.error("Error fetching users for dashboard stats:", err);
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
        setRecentActivities(combined.slice(0, 7)); // Show top 7 overall recent activities
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
          description: `Booking ID: ${booking.bookingId.substring(0,12)}... by ${booking.customerName}`,
          icon: <TagIcon className="h-5 w-5 text-primary" />,
          href: `/admin/bookings/edit/${docSnap.id}`,
        };
      });
      bookingsLoadedForActivity = true;
      if (usersLoadedForActivity) combineAndSetActivities();
    }, (err) => {
      console.error("Error fetching recent bookings:", err);
      setActivitiesError((prev) => prev ? `${prev} Failed to load recent bookings.` : "Failed to load recent bookings.");
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
          description: `${user.displayName || user.email} just joined.`,
          icon: <UserPlus className="h-5 w-5 text-accent" />,
          href: `/admin/users`, // General link to users page
        };
      });
      usersLoadedForActivity = true;
      if (bookingsLoadedForActivity) combineAndSetActivities();
    }, (err) => {
      console.error("Error fetching recent users:", err);
      setActivitiesError((prev) => prev ? `${prev} Failed to load recent users.` : "Failed to load recent users.");
      usersLoadedForActivity = true;
      if (bookingsLoadedForActivity) combineAndSetActivities();
    });

    // Fetch Analytics Data
    const fetchAnalytics = async () => {
        setIsAnalyticsLoading(true);
        try {
            // Fetch all services first to get their details
            const servicesSnapshot = await getDocs(collection(db, "adminServices"));
            const servicesDataMap = new Map(servicesSnapshot.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() } as FirestoreService]));

            // Top Services
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
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);

            // Top Search Terms
            const searchActivitiesSnapshot = await getDocs(query(collection(db, "userActivities"), where("eventType", "==", "search"), limit(500)));
            const searchCounts: { [key: string]: number } = {};
            searchActivitiesSnapshot.forEach(doc => {
                const activity = doc.data() as UserActivity;
                const term = activity.eventData?.searchQuery?.toLowerCase().trim();
                if (term) {
                    searchCounts[term] = (searchCounts[term] || 0) + 1;
                }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appConfig]); // Re-run if appConfig changes to recalculate commission

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold">Dashboard Overview</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium h-5 w-24 bg-muted rounded animate-pulse"></CardTitle>
                <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold h-8 w-32 bg-muted rounded animate-pulse"></div>
                <div className="text-xs text-muted-foreground h-4 w-20 bg-muted rounded mt-1 animate-pulse"></div>
              </CardContent>
            </Card>
          ))}
        </div>
         <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center"><History className="mr-2 h-5 w-5 text-muted-foreground" />Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="h-64 flex justify-center items-center">
             <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="text-xl font-semibold">Error Loading Dashboard Stats</h2>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Dashboard Overview</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{stats.completedRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Earned Commission</CardTitle>
            <HandCoins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{stats.earnedCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalBookings}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeUsers}</div>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Signups (Last 30d)</CardTitle>
            <BarChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{stats.newSignups}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl flex items-center">
              <History className="mr-2 h-5 w-5 text-muted-foreground" />Recent Activity
            </CardTitle>
            <CardDescription>Latest bookings and user signups.</CardDescription>
          </CardHeader>
          <CardContent>
            {isActivitiesLoading ? (
              <div className="flex justify-center items-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : activitiesError ? (
              <div className="text-center py-6 text-destructive">
                  <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
                  <p>Could not load recent activities: {activitiesError}</p>
              </div>
            ) : recentActivities.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">No recent activity to display.</p>
            ) : (
              <ul className="space-y-4">
                {recentActivities.map((activity) => (
                  <li key={activity.id} className="flex items-start space-x-3 p-3 border rounded-md shadow-sm hover:bg-muted/50 transition-colors">
                    <span className="flex-shrink-0 mt-1">{activity.icon}</span>
                    <div className="flex-grow">
                      <div className="flex justify-between items-center">
                          <p className="text-sm font-medium">{activity.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(activity.timestamp.toDate(), { addSuffix: true })}
                          </p>
                      </div>
                      <p className="text-sm text-muted-foreground">{activity.description}</p>
                      {activity.href && (
                        <Link href={activity.href} passHref>
                          <Button variant="link" size="sm" className="text-xs p-0 h-auto mt-1">View Details</Button>
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center"><ShoppingBag className="mr-2 h-5 text-primary"/>Top Trending Services</CardTitle>
            </CardHeader>
            <CardContent>
              {isAnalyticsLoading ? (
                <div className="h-40 flex items-center justify-center"><Loader2 className="animate-spin"/></div>
              ) : analytics.topServices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No booking data available.</p>
              ) : (
                <ScrollArea className="h-96">
                  <div className="space-y-4 pr-4">
                    {analytics.topServices.map(service => (
                      <Card key={service.id} className="overflow-hidden flex items-center gap-3 p-2">
                        <div className="relative w-16 h-16 bg-muted rounded-md flex-shrink-0">
                          <Image src={service.imageUrl || '/default-image.png'} alt={service.name} fill sizes="64px" className="object-cover" />
                        </div>
                        <div className="flex-grow min-w-0">
                          <p className="font-medium text-xs line-clamp-2">{service.name}</p>
                          <p className="text-sm text-muted-foreground font-bold">{service.count} <span className="font-normal">booked</span></p>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center"><Search className="mr-2 h-5 text-primary"/>Keyword Search Analytics</CardTitle></CardHeader>
            <CardContent>
               {isAnalyticsLoading ? <div className="h-40 flex items-center justify-center"><Loader2 className="animate-spin"/></div> :
                analytics.topSearchTerms.length === 0 ? <p className="text-sm text-muted-foreground">No search data available.</p> :
                <ScrollArea className="h-96">
                    <ol className="space-y-2 text-sm list-decimal list-inside pr-4">
                        {analytics.topSearchTerms.map(s => (
                            <li key={s.term} className="flex justify-between">
                            <span className="truncate pr-2">"{s.term}"</span>
                            <span className="font-semibold whitespace-nowrap">{s.count} searches</span>
                            </li>
                        ))}
                    </ol>
                </ScrollArea>
              }
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}

