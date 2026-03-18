// src/lib/adminDashboardUtils.ts
'use server';

import { adminDb } from './firebaseAdmin';
import { unstable_cache } from 'next/cache';
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
      const [bookingsSnap, usersSnap, servicesSnap, searchActivitiesSnap, persistentSearchSnap] = await Promise.all([
        adminDb.collection('bookings').get(),
        adminDb.collection('users').get(),
        adminDb.collection('adminServices').get(),
        adminDb.collection('userActivities').where('eventType', '==', 'search').limit(500).get(),
        adminDb.collection('searchAnalytics').limit(1000).get()
      ]);

      // 1. Calculate Stats
      let completedRevenue = 0;
      let earnedCommission = 0;
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

      let activeUsers = 0;
      let newSignups = 0;
      usersSnap.forEach(doc => {
        const data = doc.data() as FirestoreUser;
        if (data.isActive) activeUsers++;
        if (data.createdAt && data.createdAt.toDate() >= thirtyDaysAgo) newSignups++;
      });

      // 2. Analytics: Trending Services
      const servicesDataMap = new Map(servicesSnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() }]));
      const serviceCounts: { [key: string]: number } = {};
      bookingsSnap.forEach(doc => {
        const data = doc.data() as FirestoreBooking;
        data.services?.forEach(s => {
          serviceCounts[s.serviceId] = (serviceCounts[s.serviceId] || 0) + (s.quantity || 1);
        });
      });

      const topServices = Object.entries(serviceCounts)
        .map(([serviceId, count]) => {
          const serviceDetails = servicesDataMap.get(serviceId);
          return serviceDetails ? { ...serializeFirestoreData(serviceDetails), count } : null;
        })
        .filter(item => item !== null)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // 3. Analytics: Search Hotspots
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

      // 4. Recent Activities (Top 5 bookings + Top 5 users)
      const recentBookings = await adminDb.collection('bookings').orderBy('createdAt', 'desc').limit(5).get();
      const recentUsers = await adminDb.collection('users').orderBy('createdAt', 'desc').limit(5).get();

      const activities = [
        ...recentBookings.docs.map(doc => {
          const data = doc.data() as FirestoreBooking;
          return {
            id: doc.id,
            type: 'new_booking',
            timestamp: serializeFirestoreData(data.createdAt),
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
            timestamp: serializeFirestoreData(data.createdAt),
            title: 'New User Signup',
            description: `${data.displayName || data.email}`,
            href: `/admin/users`,
          };
        })
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 7);

      return {
        stats: {
          completedRevenue,
          totalBookings: bookingsSnap.size,
          activeUsers,
          newSignups,
          earnedCommission
        },
        analytics: {
          topServices,
          topSearchTerms
        },
        recentActivities: activities
      };
    } catch (error) {
      console.error("Error in getDashboardData:", error);
      throw error;
    }
  },
  ['admin-dashboard-stats'],
  { revalidate: 900 } // 15 minutes
);

export const getArchivedBookings = unstable_cache(
  async (): Promise<FirestoreBooking[]> => {
    try {
      let q = adminDb.collection('bookings').orderBy('createdAt', 'desc');
      
      // If we're fetching archive, we skip the first 10 (which are live on client)
      const offset = 10;
      const snapshot = await q.offset(offset).limit(50).get();
      
      return snapshot.docs.map(doc => ({
        ...serializeFirestoreData(doc.data()),
        id: doc.id
      } as FirestoreBooking));
    } catch (error) {
      console.error("Error in getArchivedBookings:", error);
      return [];
    }
  },
  ['archived-bookings', 'bookings'],
  { revalidate: 86400 } // 24 hours
);

export const getArchivedActivities = unstable_cache(
  async (): Promise<UserActivity[]> => {
    try {
      const snapshot = await adminDb.collection('userActivities')
        .orderBy('timestamp', 'desc')
        .limit(100)
        .get();

      return snapshot.docs.map(doc => ({
        ...serializeFirestoreData(doc.data()),
        id: doc.id
      } as UserActivity));
    } catch (error) {
      console.error("Error in getArchivedActivities:", error);
      return [];
    }
  },
  ['archived-activities'],
  { revalidate: 86400, tags: ['users'] }
);

