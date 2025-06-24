
"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle, PlayCircle, ExternalLink, Tag, Clock } from "lucide-react";
import type { FirestoreBooking } from '@/types/firestore';
import { Badge } from '@/components/ui/badge';
import { useLoading } from '@/contexts/LoadingContext';

interface ProviderJobCardProps {
  job: FirestoreBooking;
  type: 'new' | 'ongoing' | 'completed';
  onAccept?: (bookingId: string) => void;
  onReject?: (bookingId: string) => void;
  onStartWork?: (bookingId: string) => void;
  onCompleteWork?: (bookingId: string) => void;
  isProcessingAction?: boolean;
}

const formatDateForDisplay = (dateString: string | undefined): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString.replace(/-/g, '/'));
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) { return dateString; }
};

const ProviderJobCard: React.FC<ProviderJobCardProps> = ({
  job,
  type,
  onAccept,
  onReject,
  onStartWork,
  onCompleteWork,
  isProcessingAction
}) => {
  const { showLoading } = useLoading();
  const isJobCompleted = job.status === 'Completed';

  const handleViewDetailsClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isJobCompleted) {
      e.preventDefault(); // Prevent navigation if completed
      return;
    }
    showLoading();
    // Link component will handle navigation
  };
  
  const getStatusVariant = (status: FirestoreBooking['status']) => {
    if (status === 'ProviderAccepted' || status === 'InProgressByProvider') return 'default';
    if (status === 'Completed') return 'default'; // success style
    if (status === 'AssignedToProvider') return 'secondary';
    return 'outline';
  };

  const getStatusClasses = (status: FirestoreBooking['status']) => {
    if (status === 'ProviderAccepted' || status === 'InProgressByProvider') return 'bg-blue-500 text-white hover:bg-blue-600';
    if (status === 'Completed') return 'bg-green-500 text-white hover:bg-green-600';
    return '';
  };

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg font-semibold">{job.services.map(s => s.name).join(', ')}</CardTitle>
           <Badge variant={getStatusVariant(job.status)} className={`capitalize text-xs ${getStatusClasses(job.status)}`}>
            {job.status.replace(/([A-Z])/g, ' $1').replace('Provider ', '')}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          ID: {job.bookingId} | Customer: {isJobCompleted ? "[Hidden for Privacy]" : job.customerName}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <p><strong>Date:</strong> {formatDateForDisplay(job.scheduledDate)} at {job.scheduledTimeSlot}</p>
        <p><strong>Address:</strong> {isJobCompleted ? "[Hidden for Privacy]" : `${job.addressLine1}${job.addressLine2 ? `, ${job.addressLine2}` : ''}, ${job.city}`}</p>
        <p><strong>Contact:</strong> {isJobCompleted ? "[Hidden for Privacy]" : job.customerPhone}</p>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row justify-end gap-2 pt-3">
        <Link href={`/provider/booking/${job.id}`} passHref legacyBehavior>
          <Button variant="outline" size="sm" className="w-full sm:w-auto text-xs" asChild disabled={isJobCompleted}>
             <a onClick={handleViewDetailsClick} aria-disabled={isJobCompleted}>
                <ExternalLink className="mr-1 h-3.5 w-3.5"/>View Details
             </a>
          </Button>
        </Link>
        {type === 'new' && onAccept && onReject && (
          <>
            <Button size="sm" onClick={() => onReject(job.id!)} variant="destructive" disabled={isProcessingAction} className="w-full sm:w-auto text-xs">
              {isProcessingAction && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/>} <XCircle className="mr-1 h-3.5 w-3.5"/> Reject
            </Button>
            <Button size="sm" onClick={() => onAccept(job.id!)} disabled={isProcessingAction} className="w-full sm:w-auto text-xs">
              {isProcessingAction && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/>} <CheckCircle className="mr-1 h-3.5 w-3.5"/> Accept
            </Button>
          </>
        )}
        {type === 'ongoing' && job.status === 'ProviderAccepted' && onStartWork && (
          <Button size="sm" onClick={() => onStartWork(job.id!)} disabled={isProcessingAction} className="w-full text-xs">
            {isProcessingAction && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/>} <PlayCircle className="mr-1 h-3.5 w-3.5"/> Start Work
          </Button>
        )}
        {type === 'ongoing' && job.status === 'InProgressByProvider' && onCompleteWork && (
          <Button size="sm" onClick={() => onCompleteWork(job.id!)} disabled={isProcessingAction} className="w-full text-xs bg-green-600 hover:bg-green-700">
            {isProcessingAction && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/>} <CheckCircle className="mr-1 h-3.5 w-3.5"/> Mark Complete
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default ProviderJobCard;
