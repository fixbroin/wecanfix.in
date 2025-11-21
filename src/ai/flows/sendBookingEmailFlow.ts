
'use server';
/**
 * @fileOverview A Genkit flow to send booking confirmation and completion emails.
 *
 * - sendBookingConfirmationEmail - Sends emails to customer and admin.
 * - BookingConfirmationEmailInput - The input type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import nodemailer from 'nodemailer';
import { getBaseUrl } from '@/lib/config';

// Define Zod schema for individual service items within a booking for the email flow
const EmailBookingServiceItemSchema = z.object({
  serviceId: z.string(),
  name: z.string(),
  quantity: z.number(),
  pricePerUnit: z.number(),
  discountedPricePerUnit: z.number().optional(),
  imageUrl: z.string().url().optional(), // Added for service image
  // Added total for tiered pricing display
  total: z.number().optional(),
});

// Define Zod schema for applied platform fees
const EmailPlatformFeeItemSchema = z.object({
  name: z.string(),
  amount: z.number(), // This should be the total amount of the fee (base + tax on fee)
});

// Define Zod schema for the input, now including SMTP settings and platform fees
const BookingConfirmationEmailInputSchema = z.object({
  bookingId: z.string().describe("The unique ID of the booking."),
  customerName: z.string().describe("The name of the customer."),
  customerEmail: z.string().email().describe("The email address of the customer."),
  customerPhone: z.string().describe("The phone number of the customer."),
  addressLine1: z.string().describe("The primary address line."),
  addressLine2: z.string().optional().describe("The secondary address line, if any."),
  city: z.string().describe("The city for the service."),
  state: z.string().describe("The state for the service."),
  pincode: z.string().describe("The pincode for the service address."),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  scheduledDate: z.string().describe("The scheduled date for the service (e.g., YYYY-MM-DD or user-friendly)."),
  scheduledTimeSlot: z.string().describe("The scheduled time slot for the service."),
  services: z.array(EmailBookingServiceItemSchema).describe("An array of services included in the booking."),
  subTotal: z.number().describe("The subtotal amount for the booking before tax and visiting charge."), // This is sum of DISPLAYED item prices
  visitingCharge: z.number().optional().describe("The visiting charge applied, if any."), // This is DISPLAYED visiting charge
  discountAmount: z.number().optional().describe("Discount applied to the booking."),
  discountCode: z.string().optional().describe("Promo code applied, if any."),
  appliedPlatformFees: z.array(EmailPlatformFeeItemSchema).optional().describe("Platform fees applied to the booking."),
  taxAmount: z.number().describe("The total tax amount for the booking."),
  totalAmount: z.number().describe("The total amount for the booking."),
  paymentMethod: z.string().describe("The payment method chosen by the customer."),
  status: z.string().describe("The current status of the booking."),
  // SMTP Settings
  smtpHost: z.string().optional().describe("SMTP host for sending emails."),
  smtpPort: z.string().optional().describe("SMTP port (e.g., '587', '465')."),
  smtpUser: z.string().optional().describe("SMTP username."),
  smtpPass: z.string().optional().describe("SMTP password."),
  senderEmail: z.string().email().optional().describe("The email address to send from."),
  // New fields for different email types
  emailType: z.enum(['booking_confirmation', 'booking_completion', 'booking_rescheduled', 'booking_cancelled_by_admin', 'booking_cancelled_by_user']).optional().default('booking_confirmation'),
  invoicePdfBase64: z.string().optional().describe("Base64 encoded PDF invoice content for completion email."),
  previousScheduledDate: z.string().optional().describe("The previous scheduled date for reschedule email."),
  previousScheduledTimeSlot: z.string().optional().describe("The previous scheduled time slot for reschedule email."),
  cancellationReason: z.string().optional().describe("Reason for cancellation by admin."),
  siteName: z.string().optional(),
  logoUrl: z.string().url().optional(), // Added for logo
});

export type BookingConfirmationEmailInput = z.infer<typeof BookingConfirmationEmailInputSchema>;

export async function sendBookingConfirmationEmail(input: BookingConfirmationEmailInput): Promise<{ success: boolean; message: string }> {
  console.log("sendBookingConfirmationEmail: Flow invoked with input (passwords/invoice omitted):", {
    ...input,
    smtpPass: input.smtpPass ? '******' : undefined,
    invoicePdfBase64: input.invoicePdfBase64 ? 'PRESENT' : 'NOT_PRESENT',
  });
  try {
    const result = await bookingEmailFlow(input);
    console.log("sendBookingConfirmationEmail: Flow result:", result);
    return result;
  } catch (error) {
    console.error("sendBookingConfirmationEmail: Error calling bookingEmailFlow:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to process email flow: ${errorMessage}` };
  }
}

const createHtmlTemplate = (title: string, bodyContent: string, siteName: string, logoUrl?: string) => {
    const finalLogoUrl = logoUrl || `${getBaseUrl()}/default-image.png`;
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600&family=Roboto:wght@400;500&display=swap" rel="stylesheet">
    <style>
        body { margin: 0; padding: 0; background-color: #F8F9FA; font-family: 'Roboto', sans-serif; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px; }
        .header { text-align: center; padding-bottom: 20px; }
        .header img { max-width: 150px; }
        .content { padding: 20px 0; color: #333333; line-height: 1.6; }
        .content h2 { font-family: 'Poppins', sans-serif; color: #333333; }
        .footer { text-align: center; font-size: 12px; color: #999999; padding-top: 20px; border-top: 1px solid #eeeeee; }
        .summary, .service-item { border: 1px solid #473657ff; padding: 15px; border-radius: 8px; margin-top: 20px; }
        p, li { color: #555555; }
        strong { color: #333333; }
        ul { list-style-type: none; padding: 0; }
        .service-item { display: flex; align-items: center; gap: 15px; }
        .service-item img { width: 80px; height: 80px; object-fit: cover; border-radius: 4px; }
        .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #0B5ED7;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
        }
        .payment-summary { font-family: 'Roboto', sans-serif; line-height: 1.6; margin-top: 15px; }

        /* -------------------------------
           RESPONSIVE FIX — ADD BELOW
           ------------------------------- */
        @media only screen and (max-width: 600px) {

            .container {
                width: 100% !important;
                padding: 15px !important;
            }

            .service-item {
                flex-direction: column !important;
                align-items: flex-start !important;
            }

            .service-item img {
                width: 100% !important;
                height: auto !important;
                max-height: 250px;
            }

            .button {
                width: 100% !important;
                display: block !important;
                text-align: center !important;
            }
        }
</style>

</head>
<body>
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8F9FA;">
        <tr>
            <td align="center">
                <table class="container" width="600" border="0" cellspacing="0" cellpadding="20" style="background-color: #ffffff; margin-top: 20px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                    <tr>
                        <td>
                            <div class="header">
                                <a href="${getBaseUrl()}" target="_blank" style="text-decoration:none;">
                                 <img src="${finalLogoUrl}" alt="${siteName} Logo" style="border:0; display:inline-block; max-width:150px;" ></a>
                                     </div>
                            <div class="content">
                                <h2>${title}</h2>
                                ${bodyContent}
                            </div>
                            <div class="footer">
                                <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
                                <p>This is an automated email. Please do not reply directly.</p>
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;
};


const bookingEmailFlow = ai.defineFlow(
  {
    name: 'bookingEmailFlow',
    inputSchema: BookingConfirmationEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (bookingDetails) => {
    try { 
      console.log("====== BOOKING EMAIL FLOW START ======");
      console.log("Flow input (password/invoice omitted):", {
          ...bookingDetails,
          smtpPass: bookingDetails.smtpPass ? '******' : undefined,
          invoicePdfBase64: bookingDetails.invoicePdfBase64 ? 'PRESENT' : 'NOT_PRESENT',
      });

      const {
        smtpHost, smtpPort, smtpUser, smtpPass, senderEmail,
        emailType = 'booking_confirmation', 
        invoicePdfBase64,
        previousScheduledDate,
        previousScheduledTimeSlot,
        siteName = "Wecanfix",
        cancellationReason,
        logoUrl,
      } = bookingDetails;

      console.log("SMTP Settings Received by Flow:");
      console.log("  Host:", smtpHost); console.log("  Port:", smtpPort); console.log("  User:", smtpUser);
      console.log("  Pass Present:", !!smtpPass); console.log("  Sender Email:", senderEmail);
      console.log("  Email Type:", emailType);

      const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;
      console.log("Can attempt real email send:", canAttemptRealEmail);

      const paymentSummaryHtml = `
        <div class="payment-summary">
          Items Total: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Rs. ${bookingDetails.subTotal.toFixed(2)}<br>
          ${bookingDetails.discountAmount && bookingDetails.discountAmount > 0 ? `Discount (${bookingDetails.discountCode || ''}): - Rs. ${bookingDetails.discountAmount.toFixed(2)}<br>` : ''}
          ${bookingDetails.visitingCharge && bookingDetails.visitingCharge > 0 ? `Visiting Charge: + Rs. ${bookingDetails.visitingCharge.toFixed(2)}<br>` : ''}
          ${bookingDetails.appliedPlatformFees && bookingDetails.appliedPlatformFees.length > 0 ? bookingDetails.appliedPlatformFees.map(fee => `${fee.name}: + Rs. ${fee.amount.toFixed(2)}<br>`).join('') : ''}
          Total Tax:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ Rs. ${bookingDetails.taxAmount.toFixed(2)}<br>
          --------------------------------<br>
          <strong>Total Amount Due: Rs. ${bookingDetails.totalAmount.toFixed(2)}</strong>
        </div>
      `;
      
      const servicesHtml = bookingDetails.services.map(s => {
        const itemTotal = s.total || s.pricePerUnit * s.quantity; // Use item-level total if available
        const avgPrice = s.quantity > 0 ? itemTotal / s.quantity : 0;

        return `
        <div class="service-item">
          ${s.imageUrl ? `<img src="${s.imageUrl}" alt="${s.name}">` : ''}
          <div>
            <p><strong>${s.name}</strong> (x${s.quantity})</p>
            <p>Price: Rs. ${avgPrice.toFixed(2)}</p>
            <p>Total: Rs. ${itemTotal.toFixed(2)}</p>
          </div>
        </div>
      `}).join('');


      let customerEmailSubject = "";
      let customerEmailBody = "";
      const adminEmail = "wecanfix.in@gmail.com"; 
      let adminEmailSubject = "";
      let adminEmailBody = "";
      const attachments: import('nodemailer/lib/mailer').Options['attachments'] = [];

      // Email Content Generation
      if (emailType === 'booking_completion') {
        customerEmailSubject = `Your ${siteName} Service Completed! (ID: ${bookingDetails.bookingId})`;
        customerEmailBody = createHtmlTemplate('Service Completed!', `
          <p>Hi ${bookingDetails.customerName},</p>
          <p>We're pleased to inform you that your service booking (ID: <strong>${bookingDetails.bookingId}</strong>) has been successfully completed! We hope you are satisfied with our service.</p>
          <div class="summary">
            <h3>Booking Details</h3>
            <p><strong>Booking ID:</strong> ${bookingDetails.bookingId}</p>
            <p><strong>Scheduled:</strong> ${bookingDetails.scheduledDate} at ${bookingDetails.scheduledTimeSlot}</p>
            <p><strong>Address:</strong> ${bookingDetails.addressLine1}${bookingDetails.addressLine2 ? ', ' + bookingDetails.addressLine2 : ''}, ${bookingDetails.city}, ${bookingDetails.state} - ${bookingDetails.pincode}</p>
            <p><strong>Status:</strong> ${bookingDetails.status}</p>
            <h3>Final Payment Summary</h3>
            ${paymentSummaryHtml}
          </div>
          <p>Please find your invoice attached. We would greatly appreciate it if you could share your feedback. You will be prompted to leave a review soon.</p>
          <p>Thank you for choosing ${siteName}!</p>
        `, siteName, logoUrl);
        adminEmailSubject = `Booking Completed (ID: ${bookingDetails.bookingId})`;
        adminEmailBody = createHtmlTemplate('Admin Alert: Booking Completed', `<p>Booking ID <strong>${bookingDetails.bookingId}</strong> for <strong>${bookingDetails.customerName}</strong> has been marked as COMPLETED.</p><p>Customer: ${bookingDetails.customerName} (${bookingDetails.customerEmail}, ${bookingDetails.customerPhone}).</p><p>Total: Rs. ${bookingDetails.totalAmount.toFixed(2)}.</p>`, siteName, logoUrl);
        if (invoicePdfBase64) attachments.push({ filename: `invoice-${bookingDetails.bookingId}.pdf`, content: invoicePdfBase64, encoding: 'base64', contentType: 'application/pdf' });
      } else if (emailType === 'booking_rescheduled') {
        customerEmailSubject = `Your ${siteName} Booking Rescheduled (ID: ${bookingDetails.bookingId})`;
        customerEmailBody = createHtmlTemplate('Booking Rescheduled', `
            <p>Hi ${bookingDetails.customerName},</p>
            <p>Your service booking (ID: <strong>${bookingDetails.bookingId}</strong>) has been rescheduled.</p>
            <div class="summary">
              <p><strong>Previous Schedule:</strong> ${previousScheduledDate || 'N/A'} at ${previousScheduledTimeSlot || 'N/A'}</p>
              <p><strong>New Schedule:</strong> ${bookingDetails.scheduledDate} at ${bookingDetails.scheduledTimeSlot}</p>
            </div>
            <p>If you have any questions, please contact us.</p>
        `, siteName, logoUrl);
        adminEmailSubject = `Booking Rescheduled (ID: ${bookingDetails.bookingId})`;
        adminEmailBody = createHtmlTemplate('Admin Alert: Booking Rescheduled', `<p>Booking ID <strong>${bookingDetails.bookingId}</strong> for <strong>${bookingDetails.customerName}</strong> has been RESCHEDULED.</p><p>New Time: ${bookingDetails.scheduledDate} at ${bookingDetails.scheduledTimeSlot}.</p><p>Customer: ${bookingDetails.customerName} (${bookingDetails.customerEmail}, ${bookingDetails.customerPhone}).</p>`, siteName, logoUrl);
      } else if (emailType === 'booking_cancelled_by_admin') {
        customerEmailSubject = `Your Booking Has Been Cancelled`;
        customerEmailBody = createHtmlTemplate('Booking Cancelled', `
            <p>Dear ${bookingDetails.customerName},</p>
            <p>We regret to inform you that your booking #${bookingDetails.bookingId} has been cancelled due to unforeseen circumstances.</p>
            ${cancellationReason ? `<p><strong>Reason:</strong> ${cancellationReason}</p>` : ''}
            <p>If you have paid online, your refund will be processed within 7 working days.</p>
            <p>We apologise for the inconvenience caused.</p>
        `, siteName, logoUrl);
        adminEmailSubject = `Booking Cancelled by Admin (ID: ${bookingDetails.bookingId})`;
        adminEmailBody = createHtmlTemplate('Admin Alert: Booking Cancelled', `<p>Booking ID <strong>${bookingDetails.bookingId}</strong> for <strong>${bookingDetails.customerName}</strong> was cancelled by an admin.</p>`, siteName, logoUrl);
      } else { // booking_confirmation (default)
        customerEmailSubject = `Your ${siteName} Booking Confirmed! (ID: ${bookingDetails.bookingId})`;
        customerEmailBody = createHtmlTemplate('Booking Confirmed!', `
          <p>Hi ${bookingDetails.customerName},</p>
          <p>Thank you for booking with ${siteName}! Your service has been scheduled.</p>
          <div class="summary">
            <h3>Booking Details</h3>
            <p><strong>Booking ID:</strong> ${bookingDetails.bookingId}</p>
            <p><strong>Scheduled Date:</strong> ${bookingDetails.scheduledDate}</p>
            <p><strong>Time Slot:</strong> ${bookingDetails.scheduledTimeSlot}</p>
            <p><strong>Services:</strong></p>
            ${servicesHtml}
            <p><strong>Address:</strong> ${bookingDetails.addressLine1}${bookingDetails.addressLine2 ? ', ' + bookingDetails.addressLine2 : ''}, ${bookingDetails.city}, ${bookingDetails.state} - ${bookingDetails.pincode}</p>
            <h3>Payment Summary</h3>
            ${paymentSummaryHtml}
          </div>
          <p>We look forward to serving you!</p>
        `, siteName, logoUrl);
        
        const adminServicesListHtml = bookingDetails.services.map(s => {
  const itemTotal = (typeof s.total === 'number') ? s.total : (s.pricePerUnit * s.quantity);
  const avgPrice = s.quantity > 0 ? itemTotal / s.quantity : 0;
  return `<li>
    <strong>${s.name}</strong> (x${s.quantity}) — Avg: Rs. ${avgPrice.toFixed(2)} | Total: Rs. ${itemTotal.toFixed(2)}
  </li>`;
}).join('');
        
        let addressHtml = `<li><strong>Address:</strong> ${bookingDetails.addressLine1}${bookingDetails.addressLine2 ? ', ' + bookingDetails.addressLine2 : ''}, ${bookingDetails.city}, ${bookingDetails.state} - ${bookingDetails.pincode}</li>`;

        if (bookingDetails.latitude && bookingDetails.longitude) {
            const mapsUrl = `https://www.google.com/maps?q=${bookingDetails.latitude},${bookingDetails.longitude}`;
            addressHtml += `<li><strong style="margin-top: 5px; display: inline-block;"><a href="${mapsUrl}" target="_blank" style="text-decoration: underline; color: #0B5ED7;">View on Google Maps</a></strong></li>`;
        }

        adminEmailSubject = `New Booking Received (ID: ${bookingDetails.bookingId})`;
        adminEmailBody = createHtmlTemplate('Admin Alert: New Booking', `
          <p>A new booking has been made on ${siteName}.</p>
          <div class="summary">
            <h3>Booking Details:</h3>
            <ul>
              <li><strong>Booking ID:</strong> ${bookingDetails.bookingId}</li>
              <li><strong>Customer:</strong> ${bookingDetails.customerName}</li>
              <li><strong>Email:</strong> ${bookingDetails.customerEmail}</li>
              <li><strong>Phone:</strong> ${bookingDetails.customerPhone}</li>
              <li><strong>Scheduled Date:</strong> ${bookingDetails.scheduledDate}</li>
              <li><strong>Scheduled Time:</strong> ${bookingDetails.scheduledTimeSlot}</li>
              ${addressHtml}
              <li><strong>Status:</strong> ${bookingDetails.status}</li>
              <li><strong>Payment Method:</strong> ${bookingDetails.paymentMethod}</li>
            </ul>
            <h3>Services:</h3>
            <ul>${adminServicesListHtml}</ul>
            <h3>Payment Summary:</h3>
            ${paymentSummaryHtml}
          </div>
          <p>Please check the admin panel for more details.</p>
        `, siteName, logoUrl);
      }

      if (!canAttemptRealEmail) {
        console.warn("SMTP configuration incomplete. Logging emails to console.");
        console.log(`\n--- SIMULATING Email to Customer (${emailType}) ---\nTo: ${bookingDetails.customerEmail}\nSubject: ${customerEmailSubject}\n---`);
        console.log(`\n--- SIMULATING Email to Admin (${emailType}) ---\nTo: ${adminEmail}\nSubject: ${adminEmailSubject}\nBody: ${adminEmailBody}\n---`);
        return { success: false, message: "SMTP configuration incomplete. Email sending simulated." };
      }

      const portNumber = parseInt(smtpPort!, 10);
      if (isNaN(portNumber)) {
          return { success: false, message: "Invalid SMTP port. Email sending aborted." };
      }
      
      const transporter = nodemailer.createTransport({ host: smtpHost, port: portNumber, secure: portNumber === 465, auth: { user: smtpUser, pass: smtpPass }});
      
      const customerMailOptions: import('nodemailer/lib/mailer').Options = {
        from: `${siteName} <${senderEmail}>`,
        to: bookingDetails.customerEmail,
        subject: customerEmailSubject,
        html: customerEmailBody,
      };
      if (attachments.length > 0) customerMailOptions.attachments = attachments;

      // Send emails concurrently
      const [customerMailInfo, adminMailInfo] = await Promise.all([
          transporter.sendMail(customerMailOptions),
          transporter.sendMail({
              from: `${siteName} Admin <${senderEmail}>`,
              to: adminEmail,
              subject: adminEmailSubject,
              html: adminEmailBody,
          })
      ]);
      
      console.log("Customer and Admin email sendMail completed.");
      console.log("====== BOOKING EMAIL FLOW END (SUCCESS) ======");
      return { success: true, message: "Booking emails sent successfully." };

    } catch (flowError) { 
      console.error("====== BOOKING EMAIL FLOW - CRITICAL UNHANDLED EXCEPTION ======", flowError);
      const errorMessage = flowError instanceof Error ? flowError.message : String(flowError);
      return { success: false, message: `Critical error in email flow execution: ${errorMessage}.` };
    }
  }
);

    