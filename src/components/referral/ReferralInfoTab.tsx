
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Gift, Loader2, IndianRupee, Info } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { getBaseUrl } from '@/lib/config';
import type { ReferralSettings, Referral, EnrichedReferral } from '@/types/firestore';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';


const formatDate = (timestamp?: any): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};


interface ReferralInfoTabProps {
  settings: ReferralSettings | null;
}

export default function ReferralInfoTab({ settings }: ReferralInfoTabProps) {
  const { firestoreUser, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();
  const [referralLink, setReferralLink] = useState('');
  const [referralHistory, setReferralHistory] = useState<EnrichedReferral[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  useEffect(() => {
    if (firestoreUser?.referralCode) {
      setReferralLink(`${getBaseUrl()}/auth/signup?ref=${firestoreUser.referralCode}`);
    }
  }, [firestoreUser?.referralCode]);

  useEffect(() => {
    if (!firestoreUser?.id) {
        setIsLoadingHistory(false);
        return;
    }
    setIsLoadingHistory(true);
    const q = query(collection(db, "referrals"), where("referrerId", "==", firestoreUser.id));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
        const refs: EnrichedReferral[] = [];
        for (const docSnap of snapshot.docs) {
            const refData = docSnap.data() as Referral;
            const referredUserDoc = await getDoc(doc(db, "users", refData.referredUserId));
            const referredUserName = referredUserDoc.exists() ? referredUserDoc.data().displayName : "A User";
            refs.push({ ...refData, id: docSnap.id, referredUserName });
        }
        setReferralHistory(refs);
        setIsLoadingHistory(false);
    });
    return () => unsubscribe();
  }, [firestoreUser?.id]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ description: "Copied to clipboard!" });
    });
  };

  if (authIsLoading) {
    return <div className="flex justify-center items-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  
  if (!firestoreUser) {
    return <p>Please log in to see your referral details.</p>;
  }

  if (!settings) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          Referral program details are currently unavailable.
        </CardContent>
      </Card>
    )
  }

  const referrerBonusDisplay = settings.bonusType === 'percentage' 
    ? `${settings.referrerBonus}%` 
    : `₹${settings.referrerBonus || 0}`;

  const referredBonusDisplay = settings.bonusType === 'percentage' 
    ? `${settings.referredUserBonus}%` 
    : `₹${settings.referredUserBonus || 0}`;

  return (
    <div className="space-y-6">
       <Card>
        <CardHeader>
          <CardTitle className="text-xl">Refer & Earn</CardTitle>
          <CardDescription>Share your code and link with friends. When they sign up and complete their first qualifying booking, you both get a bonus!</CardDescription>
        </CardHeader>
        {settings.minBookingValueForBonus > 0 && (
          <CardFooter>
             <Alert variant="default" className="text-xs w-full bg-blue-50 border-blue-200">
                <Info className="h-4 w-4 text-blue-600"/>
                <AlertDescription className="text-blue-700">
                    You will receive your referral bonus once your friend completes their first booking of minimum value <span className="font-semibold">₹{settings.minBookingValueForBonus}</span>.
                </AlertDescription>
            </Alert>
          </CardFooter>
        )}
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="p-6 bg-primary/10 rounded-lg text-center">
                <p className="text-muted-foreground">Invite friends & Earn</p>
                <p className="text-3xl font-bold text-primary">{referrerBonusDisplay}</p>
            </div>
             <div className="p-6 bg-secondary rounded-lg text-center">
                <p className="text-muted-foreground">Your friend gets</p>
                <p className="text-3xl font-bold text-secondary-foreground">{referredBonusDisplay}</p>
            </div>
        </CardContent>
        
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><Gift className="mr-2 h-5 w-5 text-primary" />Your Referral Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Your Unique Referral Code</label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                readOnly
                value={firestoreUser.referralCode || 'Generating...'}
                className="font-mono text-lg bg-muted"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(firestoreUser.referralCode || '')}
                disabled={!firestoreUser.referralCode}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Your Referral Link</label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                readOnly
                value={referralLink}
                className="text-xs text-muted-foreground"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(referralLink)}
                disabled={!referralLink}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Referral History</CardTitle>
          <CardDescription>Track the status of your referrals.</CardDescription>
        </CardHeader>
        <CardContent>
            {isLoadingHistory ? (
                <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></div>
            ) : referralHistory.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">You haven't referred anyone yet.</p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Referred User</TableHead>
                            <TableHead>Signup Date</TableHead>
                            <TableHead>Bonus Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {referralHistory.map((ref, index) => (
                            <TableRow key={ref.id || index}>
                                <TableCell>{ref.referredUserName || 'A User'}</TableCell>
                                <TableCell className="text-xs">{formatDate(ref.createdAt)}</TableCell>
                                <TableCell>
                                    <Badge variant={ref.status === 'completed' ? 'default' : 'secondary'} className={`capitalize ${ref.status === 'completed' ? 'bg-green-500' : ''}`}>
                                        {ref.status}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
