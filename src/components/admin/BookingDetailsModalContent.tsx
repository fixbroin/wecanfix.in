
"use client";

import type { FirestoreBooking, BookingServiceItem, AppliedPlatformFeeItem } from '@/types/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, ExternalLink, Tag, HandCoins } from 'lucide-react'; 
import Image from 'next/image'; // Import the Next.js Image component

interface BookingDetailsModalContentProps {
  booking: FirestoreBooking;
}

const formatDetailTimestamp = (timestamp?: any): string => {
  if (!timestamp) return 'N/A';
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  try {
    return new Date(timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return String(timestamp); 
  }
};

const getBasePriceForInvoice = (displayedPrice: number, isTaxInclusive?: boolean, taxPercent?: number): number => {
    if (isTaxInclusive && taxPercent && taxPercent > 0) {
      return displayedPrice / (1 + taxPercent / 100);
    }
    return displayedPrice;
  };


export default function BookingDetailsModalContent({ booking }: BookingDetailsModalContentProps) {
  const handleViewOnMap = () => {
    if (typeof booking.latitude === 'number' && typeof booking.longitude === 'number') {
      const url = `https://www.google.com/maps?q=${booking.latitude},${booking.longitude}`;
      window.open(url, '_blank');
    }
  };

  const handleWhatsAppClick = () => {
    if (booking.customerPhone) {
      // Remove any non-digit characters except for a leading '+'
      const sanitizedPhone = booking.customerPhone.replace(/[^\d+]/g, '');
      // Ensure it starts with the country code if it doesn't already, assuming Indian numbers if no +
      const internationalPhone = sanitizedPhone.startsWith('+') ? sanitizedPhone : `91${sanitizedPhone}`;
      const intentUrl = `intent://send/?phone=${internationalPhone}&text=Hi#Intent;scheme=whatsapp;end`;
      window.location.href = intentUrl;
    }
  };


  const hasValidCoordinates = typeof booking.latitude === 'number' && typeof booking.longitude === 'number';
  const coordinatesPresent = booking.latitude != null && booking.longitude != null;
  const sumOfDisplayedItemPrices = booking.services.reduce((sum, item) => sum + (item.pricePerUnit * item.quantity), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Customer Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Name:</strong> {booking.customerName}</p>
            <p><strong>Email:</strong> {booking.customerEmail}</p>
            <div className="flex items-center gap-2">
              <p><strong>Phone:</strong> {booking.customerPhone}</p>
              {booking.customerPhone && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleWhatsAppClick} title="Chat on WhatsApp">
                  <Image src="/whatsapp.png" alt="WhatsApp Icon" width={24} height={24} />
                  <span className="sr-only">Chat on WhatsApp</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Service Address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{booking.addressLine1}</p>
            {booking.addressLine2 && <p>{booking.addressLine2}</p>}
            <p>{booking.city}, {booking.state} - {booking.pincode}</p>
            
            <div className="mt-2 space-y-1">
              <p className="text-xs text-muted-foreground flex items-center">
                <MapPin size={12} className="mr-1 text-primary"/>
                Coordinates:
              </p>
              {coordinatesPresent ? (
                <>
                  <p className="text-xs">
                    Lat: {hasValidCoordinates ? booking.latitude?.toFixed(6) : String(booking.latitude)},
                    Lng: {hasValidCoordinates ? booking.longitude?.toFixed(6) : String(booking.longitude)}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleViewOnMap}
                    className="text-xs mt-1"
                    disabled={!hasValidCoordinates}
                  >
                    <ExternalLink size={12} className="mr-1" />
                    View on Map
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">N/A</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Booking & Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div><strong>Booking ID:</strong> <Badge variant="secondary" className="text-xs">{booking.bookingId}</Badge></div>
            <div><strong>Status:</strong> <Badge variant={booking.status === "Completed" ? "default" : booking.status === "Confirmed" ? "default" : "outline"} className={ booking.status === "Confirmed" ? "bg-green-500 text-white hover:bg-green-600" : booking.status === "Completed" ? "bg-blue-500 text-white hover:bg-blue-600" : booking.status === "Cancelled" ? "bg-red-500 text-white hover:bg-red-600" : ""}>{booking.status}</Badge></div>
            <p><strong>Scheduled Date:</strong> {booking.scheduledDate}</p>
            <p><strong>Scheduled Time:</strong> {booking.scheduledTimeSlot}</p>
            <p><strong>Payment Method:</strong> {booking.paymentMethod}</p>
            {booking.razorpayPaymentId && <p><strong>Razorpay Payment ID:</strong> <span className="text-xs">{booking.razorpayPaymentId}</span></p>}
            {booking.razorpayOrderId && <p><strong>Razorpay Order ID:</strong> <span className="text-xs">{booking.razorpayOrderId}</span></p>}
            {booking.createdAt && <p><strong>Booked On:</strong> {formatDetailTimestamp(booking.createdAt)}</p>}
            {booking.updatedAt && <p><strong>Last Updated:</strong> {formatDetailTimestamp(booking.updatedAt)}</p>}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Services Booked</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service Name</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="text-right">Unit Price (₹)</TableHead>
                <TableHead className="text-right">Total (₹)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {booking.services.map((service, index) => {
                const unitPrice = service.pricePerUnit;
                const itemTotal = unitPrice * service.quantity;
                return (
                  <TableRow key={`${service.serviceId}-${index}`}>
                    <TableCell>{service.name}</TableCell>
                    <TableCell className="text-center">{service.quantity}</TableCell>
                    <TableCell className="text-right">{unitPrice.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{itemTotal.toLocaleString()}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
            <CardTitle className="text-lg">Payment Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
              <span className="text-muted-foreground">Items Total (Displayed Prices):</span>
              <span>₹{sumOfDisplayedItemPrices.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          {booking.discountAmount != null && booking.discountAmount > 0 && (
              <div className="flex justify-between text-green-600">
                  <span className="text-muted-foreground">Discount ({booking.discountCode || 'Applied'}):</span>
                  <span>- ₹{booking.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
          )}
          {booking.visitingCharge != null && booking.visitingCharge > 0 && (
               <div className="flex justify-between">
                  <span className="text-muted-foreground">Visiting Charge (Base):</span>
                  <span>+ ₹{booking.visitingCharge.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
          )}
          {booking.appliedPlatformFees && booking.appliedPlatformFees.length > 0 && booking.appliedPlatformFees.map((fee, index) => (
              <div key={`platform-fee-summary-${index}`} className="flex justify-between">
                  <span className="text-muted-foreground flex items-center">
                      <HandCoins className="mr-1 h-3.5 w-3.5 text-muted-foreground"/> {fee.name}{fee.taxRatePercentOnFee > 0 && <span className="text-xs ml-1">(incl. tax)</span>}:
                  </span>
                  <span>+ ₹{(fee.calculatedFeeAmount + fee.taxAmountOnFee).toFixed(2)}</span>
              </div>
          ))}
          <div className="flex justify-between">
              <span className="text-muted-foreground">Total Tax:</span> 
              <span>+ ₹{booking.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-bold text-md text-primary">
              <span>Total Amount:</span>
              <span>₹{booking.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </CardContent>
      </Card>

      {booking.notes && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Customer Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{booking.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
