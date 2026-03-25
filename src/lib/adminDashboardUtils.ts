// src/lib/adminDashboardUtils.ts
'use server';

import { adminDb } from './firebaseAdmin';
import { unstable_cache } from 'next/cache';
import { Timestamp } from 'firebase-admin/firestore';
import type { FirestoreBooking, FirestoreUser, FirestoreService, UserActivity } from '@/types/firestore';
import { serializeFirestoreData } from './serializeUtils';

export interface DashboardData {
  stats: {
    completedRevenue: number;
    totalBookings: number;
    activeUsers: number;
    newSignups: number;
    earnedCommission: number;
  };
  analytics: {
    topServices: any[];
    topSearchTerms: { term: string; count: number }[];
  };
  recentActivities: any[];
}

export const getDashboardData = unstable_cache(
  async (providerFeeType?: string, providerFeeValue?: number): Promise<DashboardData> => {
    try {
      // 1. Fetch Aggregate Stats (1 read)
      const statsDoc = await adminDb.collection('appConfiguration').doc('stats').get();
      const systemStats = statsDoc.exists ? statsDoc.data() : null;

      let completedRevenue = systemStats?.totalRevenue || 0;
      let totalBookings = systemStats?.totalBookings || 0;
      let activeUsers = systemStats?.totalUsers || 0;
      let newSignups = systemStats?.newSignups30d || 0;
      let earnedCommission = systemStats?.earnedCommission || 0;

      // 2. Fetch other small collections/limits
      const [servicesSnap, searchActivitiesSnap, persistentSearchSnap] = await Promise.all([
        adminDb.collection('adminServices').get(),
        adminDb.collection('userActivities').where('eventType', '==', 'search').limit(200).get(),
        adminDb.collection('searchAnalytics').limit(500).get()
      ]);

      // If stats don't exist yet, we do a one-time scan to initialize them
      if (!systemStats) {
        console.log("Dashboard stats missing, performing full scan to initialize...");
        const [bookingsSnap, usersSnap] = await Promise.all([
          adminDb.collection('bookings').get(),
          adminDb.collection('users').get()
        ]);

        completedRevenue = 0;
        earnedCommission = 0;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        bookingsSnap.forEach(doc => {
          const data = doc.data() as FirestoreBooking;
          if (data.status === 'Completed') {
            completedRevenue += data.totalAmount || 0;
            if (providerFeeType === 'fixed') {
              earnedCommission += providerFeeValue || 0;
            } else if (providerFeeType === 'percentage') {
              earnedCommission += ((data.totalAmount || 0) * (providerFeeValue || 0)) / 100;
            }
          }
        });

        activeUsers = 0;
        newSignups = 0;
        usersSnap.forEach(doc => {
          const data = doc.data() as FirestoreUser;
          if (data.isActive) activeUsers++;
          if (data.createdAt && data.createdAt.toDate() >= thirtyDaysAgo) newSignups++;
        });
        totalBookings = bookingsSnap.size;

        // Initialize the stats document for future fast reads
        adminDb.collection('appConfiguration').doc('stats').set({
          totalBookings,
          completedBookings: bookingsSnap.docs.filter(d => d.data().status === 'Completed').length,
          totalRevenue: completedRevenue,
          earnedCommission,
          totalUsers: usersSnap.size,
          newSignups30d: newSignups,
          updatedAt: Timestamp.now()
        }).catch(e => console.error("Error initializing stats:", e));
      }

      // 3. Analytics: Trending Services (Top 10 bookings - still requires some reads, but we can limit)
      // For now, keep the recent bookings check for trending services but maybe limit to last 100 bookings
      const trendingBookings = await adminDb.collection('bookings').orderBy('createdAt', 'desc').limit(200).get();
      const servicesDataMap = new Map(servicesSnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() }]));
      const serviceCounts: { [key: string]: number } = {};
      
      trendingBookings.forEach(doc => {
        const data = doc.data() as FirestoreBooking;
        data.services?.forEach(s => {
          serviceCounts[s.serviceId] = (serviceCounts[s.serviceId] || 0) + (s.quantity || 1);
        });
      });

      const topServices = Object.entries(serviceCounts)
        .map(([serviceId, count]) => {
          const serviceDetails = servicesDataMap.get(serviceId);
          return serviceDetails ? { ...serializeFirestoreData<any>(serviceDetails), count } : null;
        })
        .filter(item => item !== null)
        .sort((a, b) => (b as any).count - (a as any).count)
        .slice(0, 10);

      // 4. Analytics: Search Hotspots
      const searchCounts: { [key: string]: number } = {};
      searchActivitiesSnap.forEach(doc => {
        const term = doc.data().eventData?.searchQuery?.toLowerCase().trim();
        if (term) searchCounts[term] = (searchCounts[term] || 0) + 1;
      });
      persistentSearchSnap.forEach(doc => {
        const term = doc.data().term?.toLowerCase().trim();
        if (term) searchCounts[term] = (searchCounts[term] || 0) + 1;
      });
      const topSearchTerms = Object.entries(searchCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([term, count]) => ({ term, count }))
        .slice(0, 20);

      // 5. Recent Activities
      const [recentBookings, recentUsers] = await Promise.all([
        adminDb.collection('bookings').orderBy('createdAt', 'desc').limit(5).get(),
        adminDb.collection('users').orderBy('createdAt', 'desc').limit(5).get()
      ]);

      const activities = [
        ...recentBookings.docs.map(doc => {
          const data = doc.data() as FirestoreBooking;
          return {
            id: doc.id,
            type: 'new_booking',
            timestamp: serializeFirestoreData<string>(data.createdAt),
            title: 'New Booking',
            description: `ID: ${data.bookingId.substring(0, 8)} • ${data.customerName}`,
            href: `/admin/bookings/edit/${doc.id}`,
          };
        }),
        ...recentUsers.docs.map(doc => {
          const data = doc.data() as FirestoreUser;
          return {
            id: doc.id,
            type: 'new_user_signup',
            timestamp: serializeFirestoreData<string>(data.createdAt),
            title: 'New User Signup',
            description: `${data.displayName || data.email}`,
            href: `/admin/users`,
          };
        })
      ].sort((a, b) => new Date(b.timestamp as string).getTime() - new Date(a.timestamp as string).getTime()).slice(0, 7);

      return serializeFirestoreData<DashboardData>({
        stats: {
          completedRevenue,
          totalBookings,
          activeUsers,
          newSignups,
          earnedCommission
        },
        analytics: {
          topServices,
          topSearchTerms
        },
        recentActivities: activities
      });
    } catch (error) {
      console.error("Error in getDashboardData:", error);
      throw error;
    }
  },
  ['admin-dashboard-stats'],
  { revalidate: 900 }
);

export const getArchivedBookings = unstable_cache(
  async (): Promise<FirestoreBooking[]> => {
    try {
      const q = adminDb.collection('bookings').orderBy('createdAt', 'desc');
      
      const offset = 10;
      const snapshot = await q.offset(offset).limit(50).get();
      
      return serializeFirestoreData(snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      } as FirestoreBooking)));
    } catch (error) {
      console.error("Error in getArchivedBookings:", error);
      return [];
    }
  },
  ['archived-bookings', 'bookings'],
  { revalidate: 86400 } // 24 hours
);

export const getArchivedUsers = unstable_cache(
  async (): Promise<FirestoreUser[]> => {
    try {
      const q = adminDb.collection('users').orderBy('createdAt', 'desc');
      
      const offset = 20;
      const snapshot = await q.offset(offset).limit(50).get();
      
      return serializeFirestoreData(snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      } as FirestoreUser)));
    } catch (error) {
      console.error("Error in getArchivedUsers:", error);
      return [];
    }
  },
  ['archived-users', 'users'],
  { revalidate: 86400, tags: ['users'] }
);

export const getArchivedActivities = unstable_cache(
  async (): Promise<UserActivity[]> => {
    try {
      const snapshot = await adminDb.collection('userActivities')
        .orderBy('timestamp', 'desc')
        .limit(100)
        .get();

      return serializeFirestoreData(snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      } as UserActivity)));
    } catch (error) {
      console.error("Error in getArchivedActivities:", error);
      return [];
    }
  },
  ['archived-activities'],
  { revalidate: 86400, tags: ['users'] }
);
