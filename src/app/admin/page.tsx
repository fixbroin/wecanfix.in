
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, DollarSign, ShoppingBag, Users, Loader2, AlertTriangle, UserPlus, TagIcon, History } from "lucide-react";
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, Timestamp, orderBy, limit } from "firebase/firestore";
import type { FirestoreBooking, FirestoreUser } from '@/types/firestore';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';



interface DashboardStats {
  totalRevenue: number;
  totalBookings: number;
  activeUsers: number;
  newSignups: number;
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

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    totalBookings: 0,
    activeUsers: 0,
    newSignups: 0,
  });
  const [recentActivities, setRecentActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActivitiesLoading, setIsActivitiesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    const bookingsColRef = collection(db, "bookings");
    const usersColRef = collection(db, "users");

    const unsubscribeBookingsStats = onSnapshot(bookingsColRef, (snapshot) => {
      let currentTotalRevenue = 0;
      snapshot.forEach((doc) => {
        const booking = doc.data() as FirestoreBooking;
        currentTotalRevenue += booking.totalAmount || 0;
      });
      setStats(prevStats => ({
        ...prevStats,
        totalRevenue: currentTotalRevenue,
        totalBookings: snapshot.size,
      }));
      if (isLoading) setIsLoading(false);
    }, (err) => {
      console.error("Error fetching bookings for dashboard stats:", err);
      setError("Could not load booking data.");
      setIsLoading(false);
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
      if (isLoading) setIsLoading(false);
    }, (err) => {
      console.error("Error fetching users for dashboard stats:", err);
      setError((prevError) => prevError ? `${prevError} Could not load user data.` : "Could not load user data.");
      setIsLoading(false);
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
    
    let bookingsLoaded = false;
    let usersLoaded = false;

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
      bookingsLoaded = true;
      if (usersLoaded) combineAndSetActivities();
    }, (err) => {
      console.error("Error fetching recent bookings:", err);
      setActivitiesError((prev) => prev ? `${prev} Failed to load recent bookings.` : "Failed to load recent bookings.");
      bookingsLoaded = true; // Consider it "loaded" to unblock combining if users load
      if (usersLoaded) combineAndSetActivities(); // Attempt to show user activities if bookings fail
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
      usersLoaded = true;
      if (bookingsLoaded) combineAndSetActivities();
    }, (err) => {
      console.error("Error fetching recent users:", err);
      setActivitiesError((prev) => prev ? `${prev} Failed to load recent users.` : "Failed to load recent users.");
      usersLoaded = true;
      if (bookingsLoaded) combineAndSetActivities();
    });


    // Combined check to ensure loading is false
    const checkLoadingDone = () => {
        setTimeout(() => {
            if (isLoading) setIsLoading(false);
        }, 500); 
    }
    checkLoadingDone();

    return () => {
      unsubscribeBookingsStats();
      unsubscribeUsersStats();
      unsubscribeRecentBookings();
      unsubscribeRecentUsers();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold">Dashboard Overview</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{stats.totalRevenue.toLocaleString()}</div>
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
      
      <Card>
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
    </div>
  );
}

    
